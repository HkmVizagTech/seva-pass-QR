import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { CalendarIcon, PlusIcon, LocationIcon, RefreshIcon } from '../components/icons.jsx';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ name: '', event_code: '', location: '', date: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  useEffect(() => {
    // The app shows only live or upcoming events.
    api
      .events({ live: 1 })
      .then(({ events }) => setEvents(events))
      .catch((e) => setError(e.message));
    api
      .me()
      .then(({ user }) => setIsAdmin(user.role === 'admin'))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCreated(null);
    try {
      const { event } = await api.createEvent(form);
      setCreated(event);
      setEvents((evs) => [event, ...evs]);
      setForm({ name: '', event_code: '', location: '', date: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSyncResult('');
    setError('');
    try {
      const { synced, events: syncedEvents } = await api.syncEvents();
      setSyncResult(`Synced ${synced} event(s) from main system`);
      if (syncedEvents.length > 0) {
        setEvents(syncedEvents);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><CalendarIcon size={22} /></span>
          <div>
            <h1>Events</h1>
            <p>Manage the events you issue passes for</p>
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
            <RefreshIcon size={15} /> {syncing ? 'Syncing…' : 'Sync from main system'}
          </button>
        )}
      </header>

      {created && (
        <div className="alert alert-success">
          Event "{created.name}" created. You can now issue passes for it.
        </div>
      )}
      {syncResult && (
        <div className="alert alert-success">{syncResult}</div>
      )}

      <div className="two-col">
        {isAdmin ? (
          <section className="panel">
            <h2>Create event</h2>
            <form onSubmit={submit} className="form">
              {error && <div className="alert alert-error">{error}</div>}
              <label>
                Event name *
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Janmashtami 2026" />
              </label>
              <label>
                Event code (for main system integration)
                <input value={form.event_code} onChange={(e) => setForm({ ...form, event_code: e.target.value })} placeholder="e.g. EVT26" />
              </label>
              <label>
                Location
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Hare Krishna Temple, Visakhapatnam" />
              </label>
              <label>
                Date
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <button className="btn btn-primary">
                <PlusIcon size={16} /> Create event
              </button>
            </form>
          </section>
        ) : (
          <section className="panel">
            <h2>Events</h2>
            <p className="muted">Events are managed by the admin. You can still view the list below.</p>
          </section>
        )}

        <section className="panel">
          <h2>All events</h2>
          {events.length === 0 ? (
            <p className="muted">No events yet.</p>
          ) : (
            <div className="event-list">
              {events.map((ev) => (
                <div key={ev.id} className="event-item">
                  <span className="event-ico"><CalendarIcon size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="event-name">{ev.name}</div>
                    <div className="sub">
                      {ev.event_code && <span className="badge" style={{ marginRight: 4 }}>{ev.event_code}</span>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <LocationIcon size={11} />
                        {ev.location || 'No location'}
                      </span>
                      {ev.date ? ` · ${new Date(ev.date).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <span className="badge">{ev.pass_count} pass(es)</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
