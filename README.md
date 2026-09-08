# Experimental ToC Creator UI

Public interface: https://thedtl.github.io/experimental_ToC_Creator_UI/

Upload a scanned PDF or paste a public Dropbox PDF link, review and edit its
bookmarks beside the single-page preview, then download the bookmarked PDF.
The existing staff password is required. Processing runs in Google Cloud.
The PDF is on the left and bookmarks on the right. An original-PDF preview
appears after import/upload, while AI processing continues. **New book** returns
to the input form without reloading or signing out; previous jobs retain their
existing cleanup policy.

This repository contains only browser assets. It contains no credentials,
PDFs, job data or backend implementation. Requests go only to the experimental
backend at https://toc-bookmark-experimental-246902611372.us-central1.run.app;
the stable service is not used or modified.

The signed login session stays in this tab's memory. Reloading or opening a new
tab requires signing in again. No session is stored in a URL, localStorage,
sessionStorage or a third-party cookie. Preview does not delete the job.
After a complete download, the service deletes that job's server copies;
undownloaded jobs have a four-hour cleanup backstop.

## Updating

The private backend repository owns the shared frontend. Copy its
`experimental_bookmark/page.html` here as `index.html` and its `naming.js`,
`api-client.js` and `pdf-preview.js` to `assets/`. The only HTML difference is
the `bookmark-api` meta value, set to the experimental backend URL above.
Do not independently fork the editor or publish backend history or job artifacts.
PDF.js is served by the backend; it is not duplicated into this repository.

GitHub Pages publishes this directory from the `codex/github-pages` branch.
