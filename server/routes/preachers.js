import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { preacherGetHolders, preacherGetStats, getMainApiUrl, getHolderScanHistory } from '../services/mainSystem.js';

const router = Router();

// Any 401 coming back from the main system means the main-system token we
// embedded at login is no longer accepted (expired, or the main system rotated
// its signing secret). Surface it as a real 401 with a code so the client drops
// the stored token and sends the user to the login screen, instead of showing
// "session expired" forever while still holding a dead session.
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (err && Number(err.status) === 401) {
      return res.status(401).json({
        error: 'Your main-site session has ended. Please log in again.',
        code: 'MAIN_SESSION_EXPIRED',
      });
    }
    next(err);
  });

// Only main-system devotee sessions may call these; the main-system
// token was embedded in their app JWT at login time.
function requirePreacher(req, res, next) {
  if (!req.user?.main_token) {
    return res.status(403).json({ error: 'Preacher access required — please log in as a preacher' });
  }
  next();
}

// GET /api/preachers/me/holders?q=&category=&bahumana=&eventId=&page=&limit=
// The preacher's own holders across all festivals, filtered server-side.
router.get('/me/holders', requireAuth, requirePreacher, wrap(async (req, res) => {
  const { q = '', category = '', subCategory = '', bahumana = '', eventId = '', eventCode = '', page = 1, limit = 20 } = req.query;
  const data = await preacherGetHolders(req.user.main_token, {
    search: q,
    category,
    subCategory,
    bahumana,
    eventId,
    eventCode,
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
