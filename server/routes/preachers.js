import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { preacherGetHolders, preacherGetStats, getMainApiUrl, getHolderScanHistory } from '../services/mainSystem.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Only preacher sessions (role === 'preacher') may call these; the main-system
// token was embedded in their app JWT at login time.
function requirePreacher(req, res, next) {
  if (req.user?.role !== 'preacher') {
    return res.status(403).json({ error: 'Preacher access required' });
  }
  if (!req.user.main_token) {
    return res.status(401).json({ error: 'Preacher session missing — please log in again' });
  }
  next();
}

// GET /api/preachers/me/holders?q=&category=&bahumana=&eventId=&page=&limit=
// The preacher's own holders across all festivals, filtered server-side.
router.get('/me/holders', requireAuth, requirePreacher, wrap(async (req, res) => {
  const { q = '', category = '', bahumana = '', eventId = '', page = 1, limit = 20 } = req.query;
  const data = await preacherGetHolders(req.user.main_token, {
    search: q,
    category,
    bahumana,
    eventId,
    page,
    limit,
  });
  res.json(data);
}));

// GET /api/preachers/me/stats — totals + per-event breakdown for the preacher.
router.get('/me/stats', requireAuth, requirePreacher, wrap(async (req, res) => {
  const data = await preacherGetStats(req.user.main_token);
  res.json(data);
}));

// GET /api/preachers/me/holders/:holderId/scan-history — full scan log for a holder.
router.get('/me/holders/:holderId/scan-history', requireAuth, requirePreacher, wrap(async (req, res) => {
  const data = await getHolderScanHistory(req.user.main_token, req.params.holderId);
  res.json(data);
}));

// GET /api/preachers/qr/:qrId/image — proxies the main system's public QR
// image so the preacher can view a pass's QR without leaving the app.
router.get('/qr/:qrId/image', requireAuth, requirePreacher, wrap(async (req, res) => {
  const mainUrl = getMainApiUrl();
  if (!mainUrl) {
    return res.status(503).json({ error: 'Main system is not configured' });
  }
  const mainRes = await fetch(
    `${mainUrl}/api/qr/${encodeURIComponent(req.params.qrId)}/image`
  );
  if (!mainRes.ok) {
    return res.status(502).json({ error: 'QR image unavailable' });
  }
  res.setHeader('Content-Type', mainRes.headers.get('content-type') || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(Buffer.from(await mainRes.arrayBuffer()));
}));

export default router;
