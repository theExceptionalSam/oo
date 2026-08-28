// SchoolSync API client — envelope unwrapping, token storage, one silent
// refresh-and-retry on 401. All list endpoints return arrays via .list().
const BASE = '/api/v1';
const ACCESS = 'schoolsync.access';
const REFRESH = 'schoolsync.refresh';

const tokens = {
  get access() { return localStorage.getItem(ACCESS); },
  get refresh() { return localStorage.getItem(REFRESH); },
  set({ accessToken, refreshToken }) {
    localStorage.setItem(ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH, refreshToken);
  },
  clear() { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH); },
};

async function raw(method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

const msg = (json, status) =>
  (json?.error?.message) || (json?.message) || `Request failed (${status})`;

async function tryRefresh() {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  try {
    const { status, json } = await raw('POST', '/auth/refresh', { refreshToken: refresh });
    if (status >= 400) return false;
    tokens.set(json.data);
    return true;
  } catch { return false; }
}

export class SessionExpiredError extends Error {
  constructor() { super('Session expired — please sign in again'); }
}

async function request(method, path, body, retried = false) {
  const { status, json } = await raw(method, path, body, tokens.access);
  if (status === 401 && !retried && tokens.refresh) {
    if (await tryRefresh()) return request(method, path, body, true);
    tokens.clear();
    throw new SessionExpiredError();
  }
  if (status >= 400) throw new Error(msg(json, status));
  return json?.data ?? json;
}

export const api = {
  tokens,
  login: async (email, password) => {
    const { status, json } = await raw('POST', '/auth/login', { email, password });
    if (status >= 400) throw new Error(msg(json, status));
    tokens.set(json.data);
    return json.data.user;
  },
  logout: async () => {
    try { await request('POST', '/auth/logout'); } catch { /* best effort */ }
    tokens.clear();
  },
  me: () => request('GET', '/auth/me'),
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  list: async (path) => {
    const data = await request('GET', path);
    return Array.isArray(data) ? data : (data?.items ?? []);
  },
};
