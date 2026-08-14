const TOKEN_KEY = 'seva_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function qs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) query.set(k, v);
  });
  const s = query.toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired. Please log in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/auth/me'),
  users: () => request('/api/auth/users'),
  createUser: (body) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  stats: () => request('/api/stats'),
  events: () => request('/api/events'),
  createEvent: (body) => request('/api/events', { method: 'POST', body: JSON.stringify(body) }),

  passes: (params) => request('/api/passes' + qs(params)),
  createPass: (body) => request('/api/passes', { method: 'POST', body: JSON.stringify(body) }),
  getPass: (id) => request(`/api/passes/${id}`),
  checkIn: (token) => request(`/api/passes/${token}/check-in`, { method: 'POST' }),
  revoke: (id) => request(`/api/passes/${id}/revoke`, { method: 'POST' }),

  publicPass: (token) => request(`/api/public/passes/${token}`),
};

export async function downloadQrPng(id, filename) {
  const res = await fetch(`/api/passes/${id}/qr.png`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = String(value);
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function formatDateTime(value) {
  const d = parseDate(value);
  return d ? d.toLocaleString() : '—';
}

export function formatDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString() : '—';
}
