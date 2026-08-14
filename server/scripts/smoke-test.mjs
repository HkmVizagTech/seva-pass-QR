import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4000';

async function req(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`ok: ${msg}`);
}

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('seva_pass_test');
process.env.PORT = '4000';
// Force standalone mode regardless of server/.env so the test does not
// depend on a running main system (empty values keep dotenv from
// re-loading them from server/.env).
process.env.MAIN_SYSTEM_API_URL = '';
process.env.MAIN_SYSTEM_API_KEY = '';

const child = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit'],
});

let up = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const h = await req('GET', '/api/health');
    if (h.status === 200) {
      up = true;
      break;
    }
  } catch {}
}
assert(up, 'server started (health check)');

try {
  const login = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
  assert(login.status === 200 && login.data.token, 'default admin login works');
  const token = login.data.token;

  const badLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
  assert(badLogin.status === 401, 'wrong password rejected');

  const me = await req('GET', '/api/auth/me', { token });
  assert(me.status === 200 && me.data.user.name === 'Administrator', 'GET /me returns user');

  const unauth = await req('GET', '/api/passes');
  assert(unauth.status === 401, 'protected route rejects missing token');

  const ev = await req('POST', '/api/events', { token, body: { name: 'Janmashtami 2026', location: 'Chennai', date: '2026-08-25' } });
  assert(ev.status === 201 && ev.data.event.name === 'Janmashtami 2026', 'event created');

  const pass = await req('POST', '/api/passes', {
    token,
    body: { donor_name: 'Krishna Das', phone: '+91 9876543210', pass_type: 'VIP', event_id: ev.data.event._id, baseUrl: 'http://localhost:4000' },
  });
  assert(pass.status === 201, 'pass created');
  assert(pass.data.pass.qr_svg.length > 500, 'QR svg generated');
  assert(pass.data.pass.qr_content.startsWith('http://localhost:4000/pass?t='), 'QR content is pass URL');
  const passId = pass.data.pass.id;
  const token2 = pass.data.pass.token;

  const list = await req('GET', '/api/passes', { token });
  assert(list.status === 200 && list.data.passes.length === 1, 'pass listed');
  assert(list.data.passes[0].event_name === 'Janmashtami 2026', 'pass list includes event name');
  assert(list.data.passes[0].issuer_name === 'Administrator', 'pass list includes issuer name');

  const evs = await req('GET', '/api/events', { token });
  assert(evs.data.events[0].pass_count === 1, 'event pass_count = 1');

  const pub = await req('GET', `/api/public/passes/${token2}`);
  assert(pub.status === 200 && pub.data.pass.donor_name === 'Krishna Das' && pub.data.pass.qr_svg, 'public pass card');

  const chk = await req('POST', `/api/passes/${token2}/check-in`, { token });
  assert(chk.status === 200 && chk.data.pass.status === 'used' && !chk.data.already, 'check-in flips to used');
  const chk2 = await req('POST', `/api/passes/${token2}/check-in`, { token });
  assert(chk2.status === 200 && chk2.data.already === true, 'double scan reports already checked in');

  const stats = await req('GET', '/api/stats', { token });
  assert(stats.data.stats.total === 1 && stats.data.stats.used === 1 && stats.data.stats.checked_today === 1, 'stats correct');

  const rev = await req('POST', `/api/passes/${passId}/revoke`, { token });
  assert(rev.data.pass.status === 'revoked', 'pass revoked');
  const chkRevoked = await req('POST', `/api/passes/${token2}/check-in`, { token });
  assert(chkRevoked.status === 409, 'revoked pass rejected at gate');

  const wa = await req('POST', `/api/passes/${passId}/send-whatsapp`, { token });
  assert(wa.status === 501, 'WhatsApp endpoint returns not-configured until env is set');

  // ---- Devotee quota: a devotee with quota 1 can issue one pass, not two ----
  const newUser = await req('POST', '/api/auth/users', {
    token,
    body: { username: 'devotee1', password: 'pass1234', name: 'Devotee One', role: 'devotee', quota: 1 },
  });
  assert(newUser.status === 201 && newUser.data.user.quota === 1, 'admin creates devotee with quota 1');
  const newUserId = newUser.data.user.id;

  const devLogin = await req('POST', '/api/auth/login', { body: { username: 'devotee1', password: 'pass1234' } });
  const devToken = devLogin.data.token;

  const devPass = await req('POST', '/api/passes', {
    token: devToken,
    body: { donor_name: 'Ram Das', phone: '+91 9988776655', pass_type: 'General' },
  });
  assert(devPass.status === 201, 'devotee issues first pass within quota');

  const devPass2 = await req('POST', '/api/passes', {
    token: devToken,
    body: { donor_name: 'Shyam Das', phone: '+91 8877665544', pass_type: 'General' },
  });
  assert(devPass2.status === 403, 'quota exceeded blocks second pass');

  const devStats = await req('GET', '/api/stats', { token: devToken });
  assert(
    devStats.data.stats.quota && devStats.data.stats.quota.limit === 1 && devStats.data.stats.quota.used === 1,
    'stats report quota limit and used for devotee'
  );

  // Revoking frees quota
  const devRevoke = await req('POST', `/api/passes/${devPass.data.pass.id}/revoke`, { token: devToken });
  assert(devRevoke.data.pass.status === 'revoked', 'devotee revokes pass');
  const devPass3 = await req('POST', '/api/passes', {
    token: devToken,
    body: { donor_name: 'Madhu Das', phone: '+91 7766554433', pass_type: 'General' },
  });
  assert(devPass3.status === 201, 'revoking frees quota for a new pass');

  // ---- Admin user management: list with usage, update quota/name/password ----
  const usersList = await req('GET', '/api/auth/users', { token });
  assert(usersList.status === 200, 'admin lists users');
  const listed = usersList.data.users.find((u) => u.id === newUserId);
  assert(listed && listed.used === 1, 'user list includes used count (1 non-revoked pass after revoke)');

  const noAdmin = await req('GET', '/api/auth/users', { token: devToken });
  assert(noAdmin.status === 403, 'non-admin cannot list users');

  const upd = await req('PUT', `/api/auth/users/${newUserId}`, { token, body: { quota: 5, name: 'Devotee One Renamed' } });
  assert(upd.status === 200 && upd.data.user.quota === 5 && upd.data.user.name === 'Devotee One Renamed', 'admin updates quota and name');

  const badQuota = await req('PUT', `/api/auth/users/${newUserId}`, { token, body: { quota: 0 } });
  assert(badQuota.status === 400, 'invalid quota rejected');

  const updMissing = await req('PUT', '/api/auth/users/000000000000000000000000', { token, body: { quota: 3 } });
  assert(updMissing.status === 404, 'updating unknown user → 404');

  // Raising quota to 5 lets the devotee issue more passes now
  const devPass4 = await req('POST', '/api/passes', {
    token: devToken,
    body: { donor_name: 'Gopal Das', phone: '+91 6655443322', pass_type: 'General' },
  });
  assert(devPass4.status === 201, 'raised quota allows issuing again');

  const qr = await fetch(`${BASE}/api/passes/${passId}/qr.png`, { headers: { Authorization: `Bearer ${token}` } });
  assert(qr.status === 200 && qr.headers.get('content-type') === 'image/png', 'QR PNG download');

  const notFound = await req('GET', '/api/public/passes/nonexistent');
  assert(notFound.status === 404, 'unknown pass token → 404');

  console.log('\nALL SMOKE TESTS PASSED');
} catch (e) {
  console.error('\nSMOKE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  child.kill();
  await mongod.stop();
  process.exit(process.exitCode || 0);
}
