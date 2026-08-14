import { Router } from 'express';
import QRCode from 'qrcode';
import Pass from '../models/Pass.js';
import Event from '../models/Event.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/passes/:token', wrap(async (req, res) => {
  const pass = await Pass.findOne({ token: req.params.token }).populate('event_id', 'name location date').lean();

  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }

  const event = pass.event_id || {};

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
      qr_svg: `data:image/svg+xml;utf8,${encodeURIComponent(
        await QRCode.toString(pass.qr_content, { type: 'svg', margin: 1, width: 200 })
      )}`,
    },
  });
}));

export default router;
