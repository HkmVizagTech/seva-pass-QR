import { Router } from 'express';
import Event from '../models/Event.js';
import { isMainSystemConfigured, fetchEvents } from '../services/mainSystem.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// An event is "live or upcoming" if it has no end date yet, or its end date
// is today or later. Events with no dates at all are kept visible (legacy).
function isLive(ev) {
  if (ev.date_end) {
    const end = new Date(ev.date_end);
    if (!Number.isNaN(end.getTime())) {
      return end.getTime() >= new Date(new Date().toDateString()).getTime();
    }
  }
  if (ev.date) {
    const d = new Date(ev.date + 'T23:59:59');
    if (!Number.isNaN(d.getTime())) {
      return d.getTime() >= new Date(new Date().toDateString()).getTime();
    }
  }
  return true;
}

// Keep the local event list fresh: silently upsert the main system's events
// (with their real start/end dates) on every fetch, so live/upcoming events
// appear without requiring a manual "Sync from main system" click. Non-fatal.
async function autoSyncMainEvents() {
  if (!isMainSystemConfigured()) return;
  try {
    const mainEvents = await fetchEvents();
    for (const ev of mainEvents) {
      const eventCode = ev.eventCode || '';
      if (!eventCode) continue;
      await Event.findOneAndUpdate(
        { event_code: eventCode.toUpperCase() },
        {
          $set: {
            name: ev.name || eventCode,
            event_code: eventCode.toUpperCase(),
            location: (ev.venue && ev.venue[0] && ev.venue[0].name) || '',
            date: ev.dateStart ? new Date(ev.dateStart).toISOString().slice(0, 10) : '',
            date_start: ev.dateStart ? new Date(ev.dateStart).toISOString() : '',
            date_end: ev.dateEnd ? new Date(ev.dateEnd).toISOString() : '',
          },
        },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    }
  } catch (e) {
    console.warn('[Events] auto-sync from main system failed:', e.message);
  }
}

router.get('/', wrap(async (req, res) => {
  const { live = '' } = req.query;
  await autoSyncMainEvents();
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
        date_start: 1,
        date_end: 1,
        created_by: 1,
        created_at: 1,
        id: '$_id',
        pass_count: { $size: '$passes' },
      },
    },
    { $sort: { created_at: -1 } },
  ]);

  // ?live=1 → only live / upcoming events (the app only shows those).
  const filtered = live === '1' ? events.filter(isLive) : events;

  // Enrich with a status for the client.
  const now = Date.now();
  const withStatus = filtered.map((ev) => {
    let status = 'upcoming';
    if (ev.date_start && new Date(ev.date_start).getTime() <= now) status = 'active';
    if (ev.date_end && new Date(ev.date_end).getTime() < now) status = 'completed';
    return { ...ev, status };
  });

  res.json({ events: withStatus });
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
      {
        $set: {
          name,
          event_code: eventCode.toUpperCase(),
          location,
          date,
          date_start: ev.dateStart ? new Date(ev.dateStart).toISOString() : '',
          date_end: ev.dateEnd ? new Date(ev.dateEnd).toISOString() : '',
        },
      },
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
