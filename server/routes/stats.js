import { Router } from 'express';
import Pass from '../models/Pass.js';
import Event from '../models/Event.js';
import User from '../models/User.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, unused, used, revoked, checkedToday, events, users, myPasses, me] = await Promise.all([
    Pass.countDocuments(),
    Pass.countDocuments({ status: 'unused' }),
    Pass.countDocuments({ status: 'used' }),
    Pass.countDocuments({ status: 'revoked' }),
    Pass.countDocuments({ status: 'used', checked_in_at: { $gte: todayStart } }),
    Event.countDocuments(),
    User.countDocuments(),
    Pass.countDocuments({ issued_by: req.user.id, status: { $ne: 'revoked' } }),
    User.findById(req.user.id),
  ]);

  res.json({
    stats: {
      total,
      unused,
      used,
      revoked,
      checked_today: checkedToday,
      events,
      users,
      quota: { limit: me?.quota || 30, used: myPasses },
    },
  });
}));

export default router;
