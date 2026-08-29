import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
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

async function waitForServer(tries = 30) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const h = await req('GET', '/api/health');
      if (h.status === 200) return true;
    } catch {}
  }
  return false;
}

// Fail fast if port 4000 is already taken — otherwise the spawned test server
// crashes while waitForServer() happily talks to the OTHER process (e.g. a dev
// server pointed at the production database). That silently runs the whole
// suite against real data. Abort instead.
async function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () =>
      reject(new Error(`Port ${port} is already in use — stop the other server (it may point at the production DB!) before running the smoke test`))
    );
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
  });
}

// ─── Stub of the real main system (HkmVizagTech/iskcon-seva-pass-backend) ───
// POST /api/integration/generate-volunteer-qr — same contract, deterministic QR id.
// GET  /api/integration/events/:eventCode/entry-points — returns stub entry points.
function startMainStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const send = (status, obj) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        };
        // The integration endpoints require the API key; the preacher endpoints
        // authenticate with the preacher's own JWT instead.
        if (req.url.startsWith('/api/integration/') && req.headers['x-api-key'] !== 'test-integration-key') {
          return send(401, { status: false, message: 'Invalid API key' });
        }

        // POST /api/preachers/login — preacher credentials
        if (req.url === '/api/preachers/login' && req.method === 'POST') {
          let parsed;
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            return send(400, { status: false, message: 'Invalid JSON' });
          }
          if (parsed.password !== 'preacher-pass') {
            return send(401, { status: false, message: 'Invalid credentials' });
          }
          return send(200, {
            success: true,
            token: 'stub-preacher-token',
            preacher: {
              id: '6650a0b0c1d2e3f4a5b6c7d8',
              name: 'Mukunda Gauranga Dasa',
              shortCode: 'MKGD',
              role: 'preacher',
            },
          });
        }

        // GET /api/preachers/me/holders — the preacher's own holders
        if (req.url.startsWith('/api/preachers/me/holders') && req.method === 'GET') {
          if (req.headers.authorization !== 'Bearer stub-preacher-token') {
            return send(401, { error: 'Not authorized, token failed' });
          }
          return send(200, {
            holders: [
              {
                _id: 'h1',
                name: 'Rama Das',
                phone: '9876500000',
                catId: { name: 'Sponsor', catCode: 'SP' },
                eventId: { name: 'Test Event', eventCode: 'TSTP' },
                qrPass: {
                  qrId: 'ISK-TSTP-SP-0001',
                  status: 'active',
                  deliveryStatus: 'sent',
                  redemptionHistory: [
                    { epId: 'epb1', result: 'granted', scannedAt: '2026-08-17T10:00:00Z' },
                  ],
                },
                bahumanaReceived: true,
                bahumanaAt: '2026-08-17T10:00:00Z',
              },
            ],
            pagination: { total: 1, page: 1, pages: 1 },
          });
        }

        // GET /api/preachers/me/stats
        if (req.url.startsWith('/api/preachers/me/stats') && req.method === 'GET') {
          if (req.headers.authorization !== 'Bearer stub-preacher-token') {
            return send(401, { error: 'Not authorized, token failed' });
          }
          return send(200, {
            totalHolders: 5,
            activePasses: 4,
            scannedPasses: 2,
            scanRate: '50.0',
            byEvent: [{ eventName: 'Test Event', eventCode: 'TSTP', count: 5 }],
          });
        }

        // GET /api/qr/:qrId/image — public QR image (proxied for preachers)
        const qrImgMatch = req.url.match(/^\/api\/qr\/([^/]+)\/image$/);
        if (qrImgMatch && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          return res.end(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
              'base64'
            )
          );
        }

        // GET /api/integration/events/:eventCode/venues
        const venueMatch = req.url.match(/^\/api\/integration\/events\/([^/]+)\/venues$/);
        if (venueMatch && req.method === 'GET') {
          return send(200, [
            { index: 0, name: 'ISKCON Main Temple', address: '123 Temple Road', coordinates: null },
            { index: 1, name: 'ISKCON Branch', address: '456 Branch Road', coordinates: null },
          ]);
        }

        // GET /api/integration/events/:eventCode/entry-points
        const epMatch = req.url.match(/^\/api\/integration\/events\/([^/]+)\/entry-points$/);
        if (epMatch && req.method === 'GET') {
          return send(200, [
            { _id: 'ep001', name: 'Main Gate', stationLabel: 'GATE-1', type: 'venue_entry' },
            { _id: 'ep002', name: 'Darshan Hall', stationLabel: 'DARSH-1', type: 'darshan' },
            { _id: 'ep003', name: 'Prasadam Area', stationLabel: 'PRAS-1', type: 'prasadam' },
          ]);
        }

        const isGenerateQR = req.url === '/api/integration/generate-volunteer-qr';
        const isSevaPassIssue = req.url === '/api/integration/seva-pass/issue';
        if ((!isGenerateQR && !isSevaPassIssue) || req.method !== 'POST') {
          return send(404, { status: false, message: 'Not found' });
        }
        let parsed;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          return send(400, { status: false, message: 'Invalid JSON' });
        }
        if (!parsed.event_id || !parsed.user_phone_number) {
          return send(400, { status: false, message: 'event_id and user_phone_number are required' });
        }
        // If venue / preacher were sent, echo them in the qr_id so we can verify forwarding
        const venueLabel = parsed.venue ? `-V:${parsed.venue.replace(/\s+/g, '')}` : '';
        const preacherLabel = parsed.preacher ? `-P:${parsed.preacher.replace(/\s+/g, '')}` : '';
        const digits = String(parsed.user_phone_number).replace(/\D/g, '');
        const qrId = `ISK-${parsed.event_id}-GN-${digits.slice(-4)}01${venueLabel}${preacherLabel}`;
        send(200, {
          status: true,
          message: 'QR code generated successfully',
          qr_code:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          qr_id: qrId,
        });
      });
    });
    server.listen(4099, () => resolve(server));
  });
}

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('seva_pass_test');
process.env.PORT = '4000';
// Phase A: force standalone mode regardless of server/.env so the test does not
// depend on a running main system (empty values keep dotenv from re-loading them).
process.env.MAIN_SYSTEM_API_URL = '';
process.env.MAIN_SYSTEM_API_KEY = '';
process.env.MAIN_SYSTEM_EVENT_ID = '';

await assertPortFree(4000);

let child = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit'],
});

let stub = null;

try {
  assert(await waitForServer(), 'server started (health check)');

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

  const stats = await req('GET', '/api/stats', { token });
  assert(stats.data.stats.total === 1 && stats.data.stats.used === 0 && stats.data.stats.checked_today === 0, 'stats correct');

  const rev = await req('POST', `/api/passes/${passId}/revoke`, { token });
  assert(rev.data.pass.status === 'revoked', 'pass revoked');

  const wa = await req('POST', `/api/passes/${passId}/send-whatsapp`, { token });
  assert(wa.status === 501, 'WhatsApp endpoint returns not-configured until env is set');

  // ---- Devotee quota: a devotee with quota 1 can issue one pass, not two ----
  const newUser = await req('POST', '/api/auth/users', {
    token,
    body: { username: 'devotee1', password: 'pass1234', name: 'Devotee One', role: 'devotee', quota: 1, short_code: 'DV1', email: 'devotee1@example.com' },
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


  // ---- Delete devotee ----
  const delForbidden = await req('DELETE', `/api/auth/users/${newUserId}`, { token: devToken });
  assert(delForbidden.status === 403, 'non-admin cannot delete users');

  const delNotFound = await req('DELETE', '/api/auth/users/000000000000000000000000', { token });
  assert(delNotFound.status === 404, 'deleting unknown user \u2192 404');

  const del = await req('DELETE', `/api/auth/users/${newUserId}`, { token });
  assert(del.status === 200 && del.data.ok === true, 'admin deletes devotee');

  const delGone = await req('DELETE', `/api/auth/users/${newUserId}`, { token });
  assert(delGone.status === 404, 'deleted user \u2192 404');

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

  // ─────────────────────────────────────────────────────────────────────────
  // Phase B: integrated mode against the stub of the real main system
  // (POST /api/integration/generate-volunteer-qr)
  // ─────────────────────────────────────────────────────────────────────────
  child.kill();
  await new Promise((r) => setTimeout(r, 800));
  stub = await startMainStub();

  process.env.MAIN_SYSTEM_API_URL = 'http://localhost:4099';
  process.env.MAIN_SYSTEM_API_KEY = 'test-integration-key';
  process.env.MAIN_SYSTEM_EVENT_ID = 'EVT26';
  child = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  assert(await waitForServer(), 'integrated server started (health check)');

  const login2 = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
  const token2b = login2.data.token;

  // Create an event with an event_code — the integration should use this code
  const evWithCode = await req('POST', '/api/events', {
    token: token2b,
    body: { name: 'Ratha Yatra 2026', event_code: 'RATH26', location: 'Vizag', date: '2026-07-10' },
  });
  assert(evWithCode.status === 201 && evWithCode.data.event.event_code === 'RATH26', 'event created with event_code');

  // Issue a pass against that event — should use RATH26, not the env fallback EVT26
  const multiPass = await req('POST', '/api/passes', {
    token: token2b,
    body: { donor_name: 'Balaram Das', phone: '+91 9000012345', event_id: evWithCode.data.event._id },
  });
  assert(multiPass.status === 201, 'pass created for event with code');
  assert(multiPass.data.pass.source === 'main-system', 'pass claimed from main system');
  assert(multiPass.data.pass.main_qr_id.includes('RATH26'), 'main system used event_code RATH26, not env fallback EVT26');

  // Issue without selecting an event — should fall back to env var EVT26
  const fallbackPass = await req('POST', '/api/passes', {
    token: token2b,
    body: { donor_name: 'Sudama Das', phone: '+91 9000012346' },
  });
  assert(fallbackPass.status === 201, 'pass created without event (fallback)');
  assert(fallbackPass.data.pass.main_qr_id.includes('EVT26'), 'fallback uses env MAIN_SYSTEM_EVENT_ID');

  // ── Venue fetching ──────────────────────────────────────────────────────
  const venueList = await req('GET', '/api/passes/venues?event_code=RATH26', { token: token2b });
  assert(venueList.status === 200, 'venues endpoint returns 200');
  assert(venueList.data.venues.length === 2, 'stub returns 2 venues');
  assert(venueList.data.venues[0].name === 'ISKCON Main Temple', 'venue has correct name');

  const venueListNoCode = await req('GET', '/api/passes/venues', { token: token2b });
  assert(venueListNoCode.status === 200 && venueListNoCode.data.venues.length === 0, 'no event_code returns empty');

  // Issue a pass with a venue — verify it is forwarded to the main system
  const venuePass = await req('POST', '/api/passes', {
    token: token2b,
    body: {
      donor_name: 'Visvakarma Das',
      phone: '+91 9000012399',
      event_id: evWithCode.data.event._id,
      venue: 'ISKCON Main Temple',
    },
  });
  assert(venuePass.status === 201, 'pass with venue created');
  assert(venuePass.data.pass.main_qr_id.includes('V:ISKCONMainTemple'), 'venue forwarded to main system');

  // Issue without a phone → rejected (phone is how the main system finds the holder)
  const noPhone = await req('POST', '/api/passes', { token: token2b, body: { donor_name: 'No Phone' } });
  assert(noPhone.status === 400, 'integrated mode requires a phone number to claim a QR');

  const msPass = await req('POST', '/api/passes', {
    token: token2b,
    body: { donor_name: 'Radha Raman', phone: '+91 9123456780', email: 'rr@example.com' },
  });
  assert(msPass.status === 201 && msPass.data.pass.source === 'main-system', 'pass claimed from main system');
  assert(msPass.data.pass.main_qr_id === 'ISK-EVT26-GN-678001', 'main system QR id stored');
  assert(msPass.data.pass.qr_image && msPass.data.pass.qr_image.startsWith('data:image/png;base64,'), 'main system QR image returned');
  assert(msPass.data.pass.qr_content === 'ISK-EVT26-GN-678001', 'fallback QR content is the QR id');

  // Revoking a main-system pass works and frees quota as usual
  const msRevoke = await req('POST', `/api/passes/${msPass.data.pass.id}/revoke`, { token: token2b });
  assert(msRevoke.status === 200 && msRevoke.data.pass.status === 'revoked', 'main-system pass revocable');

  // Public pass card exposes the main system image
  const msPub = await req('GET', `/api/public/passes/${msPass.data.pass.token}`);
  assert(msPub.status === 200 && msPub.data.pass.qr_image !== null, 'public card includes main-system QR image');

  // PNG download serves the main system's image for integrated passes
  const msPng = await fetch(`${BASE}/api/passes/${msPass.data.pass.id}/qr.png`, { headers: { Authorization: `Bearer ${token2b}` } });
  assert(msPng.status === 200 && msPng.headers.get('content-type') === 'image/png', 'PNG download serves main-system image');

  // ── Preacher flow: login via main system, my holders, stats, QR image ──
  const preacherLogin = await req('POST', '/api/auth/preacher-login', {
    body: { email: 'mk@example.com', password: 'preacher-pass' },
  });
  assert(preacherLogin.status === 200 && preacherLogin.data.token, 'preacher login via main system');
  const pToken = preacherLogin.data.token;
  assert(
    preacherLogin.data.user.role === 'preacher' && preacherLogin.data.user.shortCode === 'MKGD',
    'preacher profile returned from main system'
  );

  const wrongPreacher = await req('POST', '/api/auth/preacher-login', {
    body: { email: 'mk@example.com', password: 'wrong' },
  });
  assert(wrongPreacher.status === 401, 'bad preacher credentials rejected');

  const pMe = await req('GET', '/api/auth/me', { token: pToken });
  assert(
    pMe.status === 200 && pMe.data.user.role === 'preacher' && pMe.data.user.shortCode === 'MKGD',
    'preacher /me served from session'
  );

  const myHolders = await req('GET', '/api/preachers/me/holders?category=SP&bahumana=yes', { token: pToken });
  assert(myHolders.status === 200 && myHolders.data.holders.length === 1, 'preacher my holders fetched');
  assert(myHolders.data.holders[0].bahumanaReceived === true, 'bahumanaReceived flag present');
  assert(myHolders.data.holders[0].catId.catCode === 'SP', 'category populated on holder');

  const pStats = await req('GET', '/api/stats', { token: pToken });
  assert(
    pStats.status === 200 && pStats.data.stats.main_system === true && pStats.data.stats.totalHolders === 5,
    'preacher stats come from main system'
  );

  const forbidden = await req('GET', '/api/preachers/me/holders', { token: token2b });
  assert(forbidden.status === 403, 'non-preacher blocked from preacher endpoints');

  // A preacher-issued pass is attributed to them on the main system
  const pPass = await req('POST', '/api/passes', {
    token: pToken,
    body: { donor_name: 'Jaya Das', phone: '+91 9234567890', event_id: evWithCode.data.event._id },
  });
  assert(pPass.status === 201 && pPass.data.pass.source === 'main-system', 'preacher issues a pass');

  // An app devotee with a preacher short code gets their passes attributed too
  const codeUser = await req('POST', '/api/auth/users', {
    token: token2b,
    body: { username: 'mkdevotee', password: 'pass1234', name: 'Mukunda Devotee', role: 'devotee', quota: 5, short_code: 'MKGD', email: 'mkdevotee@example.com' },
  });
  assert(codeUser.status === 201 && codeUser.data.user.short_code === 'MKGD', 'devotee created with preacher short code');
  const codeLogin = await req('POST', '/api/auth/login', { body: { username: 'mkdevotee', password: 'pass1234' } });
  const codePass = await req('POST', '/api/passes', {
    token: codeLogin.data.token,
    body: { donor_name: 'Vasudeva Das', phone: '+91 9345678901', event_id: evWithCode.data.event._id },
  });
  assert(codePass.status === 201 && codePass.data.pass.source === 'main-system', 'devotee with code issues a pass');
  assert(codePass.data.pass.main_qr_id.includes('P:MKGD'), 'short code forwarded as preacher attribution');

  // QR image proxied for the preacher
  const pQr = await fetch(`${BASE}/api/preachers/qr/ISK-TSTP-SP-0001/image`, {
    headers: { Authorization: `Bearer ${pToken}` },
  });
  assert(pQr.status === 200 && pQr.headers.get('content-type') === 'image/png', 'preacher QR image proxied');

  console.log('\nALL SMOKE TESTS PASSED');
} catch (e) {
  console.error('\nSMOKE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  if (stub) stub.close();
  await mongod.stop();
  process.exit(process.exitCode || 0);
}
