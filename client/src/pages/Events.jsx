import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ name: '', location: '', date: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    api
      .events()
      .then(({ events }) => setEvents(events))
      .catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { event } = await api.createEvent(form);
      setCreated(event);
      setEvents((evs) => [event, ...evs]);
      setForm({ name: '', location: '', date: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1>Events</h1>
        <p>Manage the events you issue passes for</p>
      </header>

      {created && (
        <div className="alert alert-success">
          Event “{created.name}” created. You can now issue passes for it.
        </div>
      )}

      <div className="two-col">
        <section className="panel">
          <h2>Create event</h2>
          <form onSubmit={submit} className="form">
            {error && <div className="alert alert-error">{error}</div>}
            <label>
              Event name *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Janmashtami 2026" />
            </label>
            <label>
              Location
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Hare Krishna Temple, Chennai" />
            </label>
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <button className="btn btn-primary">Create event</button>
          </form>
        </section>

        <section className="panel">
          <h2>All events</h2>
          {events.length === 0 ? (
            <p className="muted">No events yet.</p>
          ) : (
            <div className="event-list">
              {events.map((ev) => (
                <div key={ev.id} className="event-item">
                  <div>
                    <div className="event-name">{ev.name}</div>
                    <div className="sub">
                      {ev.location || 'No location'}
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
