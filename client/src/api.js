const TOKEN_KEY = 'seva_token';

// The backend origin for native (Capacitor) builds. When unset the app talks
// to the same origin that serves it (Vite dev proxy / deployed domain).
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
// The public site URL where pass card pages are served (Vercel).
const SITE_BASE = (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, '');

export function apiOrigin() {
  return API_BASE || window.location.origin;
}

export function siteOrigin() {
  return SITE_BASE || window.location.origin;
}

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

  const res = await fetch(API_BASE + path, { ...options, headers });
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
  syncEvents: () => request('/api/events/sync', { method: 'POST' }),

  passes: (params) => request('/api/passes' + qs(params)),
  createPass: (body) => request('/api/passes', { method: 'POST', body: JSON.stringify(body) }),
  getPass: (id) => request(`/api/passes/${id}`),
  revoke: (id) => request(`/api/passes/${id}/revoke`, { method: 'POST' }),
  entryPoints: (eventCode) => request('/api/passes/entry-points' + qs({ event_code: eventCode })),
  venues: (eventCode) => request('/api/passes/venues' + qs({ event_code: eventCode })),

  publicPass: (token) => request(`/api/public/passes/${token}`),
};

export async function downloadQrPng(id, filename) {
  const res = await fetch(`${API_BASE}/api/passes/${id}/qr.png`, {
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

export async function shareWhatsApp(id, phone, donorName, passToken, qrSvgDataUrl) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? '91' + digits : digits;
  const passUrl = `${siteOrigin()}/pass?t=${passToken}`;
  const text = `Hare Krishna ${donorName}! Here is your seva pass:\n\n${passUrl}`;
  const debug = [];

  // Step 1: Generate QR PNG using qrcode library
  let base64 = '';
  try {
    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.toDataURL(passUrl, { width: 600, margin: 1 });
    base64 = dataUrl.split(',')[1] || '';
    debug.push(`QR OK: ${base64.length} chars`);
  } catch (e) {
    debug.push(`QR FAIL: ${e.message}`);
  }

  // Step 2: Capacitor Share with image
  if (base64) {
    try {
      const { Share } = await import('@capacitor/share');
      // Android plugin expects files as array of data-URI strings, not objects
      await Share.share({
        title: `${donorName} — Seva Pass`,
        text,
        files: [`data:image/png;base64,${base64}`],
      });
      debug.push('SHARE OK');
      return;
    } catch (e) {
      debug.push(`SHARE FAIL: ${e.message || e}`);
    }
  }

  // Step 3: navigator.share fallback
  if (base64 && navigator.share) {
    try {
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/png' });
      const file = new File([blob], `${donorName.replace(/\s+/g, '-')}-pass.png`, { type: 'image/png' });
      await navigator.share({ text, files: [file] });
      debug.push('NAVSHARE OK');
      return;
    } catch (e) {
      debug.push(`NAVSHARE FAIL: ${e.message || e}`);
    }
  }

  // Show debug info so user can report what happened
  alert('Share debug:\n' + debug.join('\n'));

  // Fallback: WhatsApp text
  window.open(`https://wa.me/${international}?text=${encodeURIComponent(text)}`, '_blank');
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = String(value);
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  // Date-only strings (e.g. "2026-08-14") should stay on the local calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
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
