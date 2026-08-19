const TOKEN_KEY = 'seva_token';

// ---------------------------------------------------------------------------
// Backend / site origins
//
// The web build talks to the same origin that serves it. The native (Capacitor)
// build has no backend of its own, so it needs an absolute URL. That normally
// comes from client/.env.android via `vite build --mode android`, but if the APK
// is ever built with a plain `vite build` those vars are empty, every request
// becomes a relative URL, and the Capacitor WebView answers it with index.html —
// which parses as an empty object and leaves the app spinning on "Loading…".
// These constants are the safety net for that case.
// ---------------------------------------------------------------------------
const PROD_API = 'https://seva-pass-server-production.up.railway.app';
const PROD_SITE = 'https://seva-pass-qr-server.vercel.app';

const clean = (value) => (value || '').replace(/\/+$/, '');

// True when running inside the Capacitor native shell (the Android app).
function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {}
  const { protocol, hostname, port } = window.location;
  if (protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:') return true;
  // Capacitor Android serves the app from https://localhost with no port.
  return hostname === 'localhost' && !port && !import.meta.env.DEV;
}

let apiBaseCache = null;
function apiBase() {
  if (apiBaseCache === null) {
    apiBaseCache = clean(import.meta.env.VITE_API_URL) || (isNativeApp() ? PROD_API : '');
  }
  return apiBaseCache;
}

let siteBaseCache = null;
function siteBase() {
  if (siteBaseCache === null) {
    siteBaseCache = clean(import.meta.env.VITE_SITE_URL) || (isNativeApp() ? PROD_SITE : '');
  }
  return siteBaseCache;
}

export function apiOrigin() {
  return apiBase() || window.location.origin;
}

export function siteOrigin() {
  return siteBase() || window.location.origin;
}

export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  // Guard against a bad value written by an earlier broken build.
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

export function setToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Login failed: the server did not return a session token.');
  }
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
  headers.Accept = 'application/json';

  const url = apiBase() + path;

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection and try again.');
  }

  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired. Please log in again.');
  }

  const raw = await res.text();
  let data = {};
  if (raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch {
      // Not JSON — almost always means the request never reached the API
      // (wrong base URL, offline proxy, or the app shell answering instead).
      throw new Error(
        `The server sent an unexpected reply (HTTP ${res.status}). The app may be pointing at the wrong backend.`
      );
    }
  }
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  // Preacher / devotee login against the main ISKCON system.
  preacherLogin: ({ email, phone, password }) =>
    request('/api/auth/preacher-login', { method: 'POST', body: JSON.stringify({ email, phone, password }) }),
  me: () => request('/api/auth/me'),
  users: () => request('/api/auth/users'),
  createUser: (body) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/api/auth/users/${id}`, { method: 'DELETE' }),

  stats: () => request('/api/stats'),
  events: (params) => request('/api/events' + qs(params)),
  createEvent: (body) => request('/api/events', { method: 'POST', body: JSON.stringify(body) }),
  syncEvents: () => request('/api/events/sync', { method: 'POST' }),
  eventCategories: (eventId) => request(`/api/events/${eventId}/categories`),
  updateDevoteeCategories: (eventId, categories) =>
    request(`/api/events/${eventId}/devotee-categories`, { method: 'PATCH', body: JSON.stringify({ categories }) }),

  // Preacher-scoped views (main system, proxied).
  myHolders: (params) => request('/api/preachers/me/holders' + qs(params)),
  myStats: () => request('/api/preachers/me/stats'),
  // Scan history for a specific holder (main system, proxied).
  holderScanHistory: (holderId) => request(`/api/preachers/me/holders/${encodeURIComponent(holderId)}/scan-history`),
  // Returns a blob object URL for a holder's QR image (main system, proxied).
  holderQrImage: async (qrId) => {
    const res = await fetch(`${apiBase()}/api/preachers/qr/${encodeURIComponent(qrId)}/image`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Failed to load QR image');
    return URL.createObjectURL(await res.blob());
  },

  passes: (params) => request('/api/passes' + qs(params)),
  createPass: (body) => request('/api/passes', { method: 'POST', body: JSON.stringify(body) }),
  getPass: (id) => request(`/api/passes/${id}`),
  revoke: (id) => request(`/api/passes/${id}/revoke`, { method: 'POST' }),
  venues: (eventCode) => request('/api/passes/venues' + qs({ event_code: eventCode })),
  categories: (eventCode) => request('/api/passes/categories' + qs({ event_code: eventCode })),

  publicPass: (token) => request(`/api/public/passes/${token}`),

  testMainSystem: () => request('/api/passes/test-main-system'),
};

export async function downloadQrPng(id, filename) {
  const res = await fetch(`${apiBase()}/api/passes/${id}/qr.png`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();

  // Capacitor / Android: save to cache and open the share sheet.
  if (isNativeApp()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ title: filename, files: [writeResult.uri] });
      return;
    } catch (e) {
      console.warn('Native share failed, falling back:', e);
    }
  }

  // Web: programmatic <a> click download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function shareWhatsApp(id, phone, donorName, passToken, mainQrImage) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? '91' + digits : digits;
  const passUrl = `${siteOrigin()}/pass?t=${passToken}`;
  const text = `Hare Krishna ${donorName}! Here is your seva pass:\n\n${passUrl}`;

  // Use the actual gate-scannable QR from the main system if available.
  // For local passes, generate a QR of the pass card URL instead.
  let base64 = '';
  if (mainQrImage) {
    // mainQrImage may be a data URL or raw base64
    base64 = mainQrImage.includes(',') ? mainQrImage.split(',')[1] : mainQrImage;
  } else {
    try {
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(passUrl, { width: 600, margin: 1 });
      base64 = dataUrl.split(',')[1] || '';
    } catch {}
  }

  if (base64) {
    // Custom WhatsApp plugin: writes the image to cache, then opens WhatsApp
    // directly with the contact + image attached.
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const WhatsAppShare = registerPlugin('WhatsAppShare');
      await WhatsAppShare.share({
        data: base64,
        phone: international,
        text,
        filename: `${donorName.replace(/\s+/g, '-')}-pass.png`,
      });
      return;
    } catch (e) {
      console.warn('WhatsAppShare plugin failed:', e);
    }

    // Capacitor Share fallback (opens the share picker)
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const filename = `${donorName.replace(/\s+/g, '-')}-pass.png`;
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: `${donorName} — Seva Pass`,
        text,
        files: [writeResult.uri],
      });
      return;
    } catch {}
  }

  // Fallback: WhatsApp text only
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
