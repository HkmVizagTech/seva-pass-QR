import { Router } from 'express';
import Event from '../models/Event.js';
import { isMainSystemConfigured, fetchEvents } from '../services/mainSystem.js';

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
        event_code: 1,
        location: 1,
        date: 1,
        created_by: 1,
        created_at: 1,
        id: '$_id',
        pass_count: { $size: '$passes' },
      },
    },
    { $sort: { created_at: -1 } },
  ]);
  res.json({ events });
}));

// Sync events from the main system — pulls all events and upserts locally.
// Only works when the main system is configured.
router.post('/sync', wrap(async (req, res) => {
  if (!isMainSystemConfigured()) {
    return res.status(400).json({ error: 'Main system is not configured' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to sync events' });
  }
  const mainEvents = await fetchEvents();
  if (mainEvents.length === 0) {
    return res.json({ synced: 0, events: [] });
  }
  const synced = [];
  for (const ev of mainEvents) {
    const eventCode = ev.eventCode || '';
    const name = ev.name || eventCode;
    const location = (ev.venue && ev.venue[0] && ev.venue[0].name) || '';
    const date = ev.dateStart ? new Date(ev.dateStart).toISOString().slice(0, 10) : '';
    const doc = await Event.findOneAndUpdate(
      { event_code: eventCode.toUpperCase() },
      { $set: { name, event_code: eventCode.toUpperCase(), location, date } },
      { upsert: true, new: true, runValidators: true },
    );
    synced.push(doc);
  }
  res.json({ synced: synced.length, events: synced });
}));

router.post('/', wrap(async (req, res) => {
  // Only admins may create events.
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to create events' });
  }
  const { name, event_code = '', location = '', date = '' } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Event name is required' });
  }
  const event = await Event.create({ name: name.trim(), event_code: event_code.trim(), location: location.trim(), date, created_by: req.user.id });
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
