// One page, one canvas. PDF bytes come only from the configured service.
export function createPdfPreview(holder, status, loadLibrary = () => import('/assets/pdfjs/build/pdf.mjs'),
  { request = fetch, assetUrl = value => value, origin = location.origin } = {}) {
  const canvas = document.createElement('canvas');
  canvas.hidden = true; canvas.setAttribute('role', 'img'); holder.replaceChildren(canvas);
  let current, renderTask, shownPage, sequence = 0, resizeTimer, wanted;
  const cancelled = error => ['AbortError', 'RenderingCancelledException'].includes(error?.name);

  async function closeDocument() {
    const old = current; current = null;
    old?.abort.abort(); renderTask?.cancel();
    shownPage = null;
    if (old?.task) await old.task.destroy().catch(() => {});
  }
  async function load(url) {
    if (current?.url === url) return current.ready;
    const closing = closeDocument();
    const state = { url, abort: new AbortController(), queue: Promise.resolve() };
    current = state;
    state.ready = (async () => {
      await closing;
      if (state.abort.signal.aborted) throw new DOMException('Preview closed', 'AbortError');
      const pdfjs = await loadLibrary();
      if (state.abort.signal.aborted) throw new DOMException('Preview closed', 'AbortError');
      pdfjs.GlobalWorkerOptions.workerSrc = assetUrl('/assets/pdfjs/build/pdf.worker.mjs');
      const options = { credentials: 'same-origin', cache: 'no-store', signal: state.abort.signal };
      const head = await request(url, { ...options, method: 'HEAD' });
      if (state.abort.signal.aborted) throw new DOMException('Preview closed', 'AbortError');
      const length = Number(head.headers.get('Content-Length'));
      const generation = new URL(url, location.href).searchParams.get('generation');
      const etag = head.headers.get('ETag');
      if (!head.ok || !Number.isSafeInteger(length) || length <= 0 || !/^\d+$/.test(generation || '')
          || etag !== '"' + generation + '"' || head.headers.get('Accept-Ranges') !== 'bytes'
          || !head.headers.get('Content-Type')?.startsWith('application/pdf')) {
        throw new Error('The PDF is unavailable or changed. Refresh this job before previewing.');
      }
      // A full GET above 32 MiB is chunked by Cloud Run, without Content-Length.
      // HEAD + explicit ranges avoids a whole-book download for range detection.
      const range = new pdfjs.PDFDataRangeTransport(length, new Uint8Array(0), true);
      range.abort = () => state.abort.abort();
      range.requestDataRange = (begin, end) => {
        state.queue = state.queue.then(async () => {
          if (![begin, end].every(Number.isSafeInteger) || begin < 0 || end <= begin || end > length) throw new Error('Invalid preview byte range');
          const response = await request(url, { ...options, headers: { Range: `bytes=${begin}-${end - 1}` } });
          if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${begin}-${end - 1}/${length}`
              || response.headers.get('ETag') !== etag) {
            await response.body?.cancel();
            throw new Error('The requested PDF range is unavailable. Refresh this job; no full-file fallback was used.');
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== end - begin) throw new Error('The preview range was incomplete');
          range.onDataRange(begin, bytes);
        }).catch(error => {
          if (state.abort.signal.aborted) return;
          state.error = error;
          if (current === state) status.textContent = 'Preview unavailable: ' + error.message + ' Your bookmarks and download remain available.';
          state.abort.abort(); state.task?.destroy().catch(() => {});
        });
      };
      state.task = pdfjs.getDocument({ range, rangeChunkSize: 1024 * 1024,
        disableAutoFetch: true, disableStream: true,
        cMapUrl: assetUrl('/assets/pdfjs/cmaps/'), cMapPacked: true,
        standardFontDataUrl: assetUrl('/assets/pdfjs/standard_fonts/'),
        wasmUrl: assetUrl('/assets/pdfjs/wasm/'), iccUrl: assetUrl('/assets/pdfjs/iccs/') });
      return state.task.promise;
    })();
    return state.ready;
  }

  async function show(url, pageNumber) {
    const parsed = new URL(url, location.href);
    if (parsed.origin !== origin || !Number.isInteger(pageNumber) || pageNumber < 1) return;
    wanted = { url: parsed.href, pageNumber };
    const request = ++sequence, previous = renderTask;
    previous?.cancel(); canvas.hidden = true; delete canvas.dataset.page;
    holder.setAttribute('aria-busy', 'true'); status.textContent = 'Loading PDF page ' + pageNumber + '…';
    try {
      if (previous) await previous.promise.catch(() => {});
      if (request !== sequence) return;
      const pdf = await load(parsed.href);
      if (request !== sequence) return;
      if (pageNumber > pdf.numPages) throw new Error('This page is outside the PDF');
      const page = await pdf.getPage(pageNumber);
      if (request !== sequence) return;
      if (shownPage && shownPage !== page) shownPage.cleanup();
      shownPage = page;
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(Math.max(1, holder.clientWidth - 24) / original.width,
        Math.max(1, holder.clientHeight - 24) / original.height);
      const viewport = page.getViewport({ scale }), density = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * density); canvas.height = Math.ceil(viewport.height * density);
      canvas.style.width = Math.floor(viewport.width) + 'px'; canvas.style.height = Math.floor(viewport.height) + 'px';
      canvas.setAttribute('aria-label', 'PDF page ' + pageNumber + ' of ' + pdf.numPages);
      if (canvas.parentNode !== holder) holder.replaceChildren(canvas);
      renderTask = page.render({ canvas, viewport, transform: density === 1 ? null : [density, 0, 0, density, 0, 0] });
      await renderTask.promise;
      if (request !== sequence) return;
      canvas.dataset.page = String(pageNumber); canvas.hidden = false;
      status.textContent = 'PDF page ' + pageNumber + ' of ' + pdf.numPages;
    } catch (error) {
      if (request === sequence && !cancelled(error)) status.textContent = 'Preview unavailable: '
        + (current?.error || error).message + ' Your bookmarks and download remain available.';
    } finally {
      if (request === sequence) { renderTask = null; holder.setAttribute('aria-busy', 'false'); }
    }
  }
  async function destroy() {
    const request = ++sequence; wanted = null; clearTimeout(resizeTimer);
    canvas.hidden = true; delete canvas.dataset.page; status.textContent = '';
    holder.setAttribute('aria-busy', 'false');
    await closeDocument();
    if (request === sequence) canvas.width = canvas.height = 1;
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    if (wanted && holder.clientWidth && holder.clientHeight) resizeTimer = setTimeout(() => {
      if (wanted) show(wanted.url, wanted.pageNumber);
    }, 120);
  }).observe(holder);
  return { show, destroy };
}
