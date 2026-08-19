import { Router } from 'express';
import QRCode from 'qrcode';
import Pass from '../models/Pass.js';
import Event from '../models/Event.js';
import { getQrPassDetails } from '../services/mainSystem.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/passes/:token', wrap(async (req, res) => {
  const pass = await Pass.findOne({ token: req.params.token }).populate('event_id', 'name location date').lean();

  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }

  const event = pass.event_id || {};

  // For main-system passes, fetch scan status (redemption history)
  let scanStatus = null;
  if (pass.qr_token && pass.source === 'main-system') {
    try {
      const qrDetails = await getQrPassDetails(pass.qr_token);
      if (qrDetails && qrDetails.redemptionHistory) {
        scanStatus = qrDetails.redemptionHistory;
      }
    } catch {
      // Ignore — scan status is non-critical
    }
  }

  res.json({
    pass: {
      token: pass.token,
      donor_name: pass.donor_name,
      pass_type: pass.pass_type,
      status: pass.status,
      event_name: event.name || null,
      event_location: event.location || null,
      event_date: event.date || null,
      valid_from: pass.valid_from || null,
      valid_until: pass.valid_until || null,
      checked_in_at: pass.checked_in_at || null,
      created_at: pass.created_at || null,
      // Main-system passes carry their own QR image; locals render from content.
      qr_image: pass.main_qr_image || null,
      qr_svg: `data:image/svg+xml;utf8,${encodeURIComponent(
        await QRCode.toString(pass.qr_content, { type: 'svg', margin: 1, width: 200 })
      )}`,
      // Scan status from the main system
      scan_status: scanStatus,
    },
  });
}));

router.get('/passes/:token/qr.png', wrap(async (req, res) => {
  const pass = await Pass.findOne({ token: req.params.token }).lean();
  if (!pass) return res.status(404).json({ error: 'Pass not found' });

  res.setHeader('Content-Disposition', `attachment; filename="pass-${pass.token.slice(0, 8)}.png"`);
  if (pass.main_qr_image) {
    const base64 = String(pass.main_qr_image).replace(/^data:image\/\w+;base64,/, '');
    res.setHeader('Content-Type', 'image/png');
    return res.send(Buffer.from(base64, 'base64'));
  }
  const buf = await QRCode.toBuffer(pass.qr_content, { type: 'png', margin: 1, width: 600 });
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
}));

export default router;
