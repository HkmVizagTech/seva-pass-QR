import { Router } from 'express';
import Event from '../models/Event.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (req, res) => {
  const events = await Event.aggregate([
    {
      $lookup: {
        from: 'passes',
        localField: '_id',
        foreignField: 'event_id',
        as: 'passes',
      },
    },
    {
      $project: {
        name: 1,
        location: 1,
        date: 1,
        created_by: 1,
        created_at: 1,
        pass_count: { $size: '$passes' },
      },
    },
    { $sort: { created_at: -1 } },
  ]);
  res.json({ events });
}));

router.post('/', wrap(async (req, res) => {
  // Only admins may create events.
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to create events' });
  }
  const { name, location = '', date = '' } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Event name is required' });
  }
  const event = await Event.create({ name: name.trim(), location: location.trim(), date, created_by: req.user.id });
  res.status(201).json({ event });
}));

router.get('/:id', wrap(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json({ event });
}));

export default router;
