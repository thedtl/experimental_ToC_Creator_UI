// One experimental API, whether the UI is served by Cloud Run or GitHub Pages.
// Credentials stay in this tab's memory, never in a URL or browser storage.
export function createApiClient(base = location.origin, fetchImpl = fetch) {
  const origin = new URL(base).origin;
  const crossOrigin = origin !== location.origin;
  let token = '';
  function url(value) {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || parsed.username || parsed.password
        || !['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid service URL');
    return parsed.href;
  }
  async function request(value, options = {}) {
    const target = url(value), headers = new Headers(options.headers);
    if (!new URL(target).pathname.startsWith('/api/')) throw new Error('Invalid API path');
    if (crossOrigin && token) headers.set('Authorization', 'Bearer ' + token);
    return fetchImpl(target, { ...options, headers, credentials: crossOrigin ? 'omit' : 'same-origin',
      cache: 'no-store', redirect: 'error' });
  }
  async function login(password) {
    token = '';
    const response = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }) });
    const data = await response.json();
    if (!response.ok || !data.authenticated) throw new Error('The password was not accepted.');
    if (crossOrigin) {
      if (!/^\d+\.[a-f0-9]{64}$/.test(data.session_token || '')) throw new Error('The service did not issue a session.');
      token = data.session_token;
    }
  }
  return { origin, crossOrigin, url, request, login, clear: () => { token = ''; },
    assetUrl: value => url(value) };
}
