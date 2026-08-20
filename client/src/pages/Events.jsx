import React, { useEffect, useState } from 'react';
import { api, parseDate } from '../api.js';
import { CalendarIcon, PlusIcon, LocationIcon, RefreshIcon, SettingsIcon, CheckIcon } from '../components/icons.jsx';

function ConfigureModal({ event, onClose, onSaved }) {
  const [allCategories, setAllCategories] = useState([]);
  const [selected, setSelected] = useState({});
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .eventCategories(event.id)
      .then(({ categories }) => {
        setAllCategories(categories || []);
        const sel = {};
        const lmt = {};
        for (const c of categories || []) {
          sel[c.catCode] = true;
          lmt[c.catCode] = c.limit != null ? c.limit : '';
        }
        setSelected(sel);
        setLimits(lmt);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [event.id]);

  const toggle = (code) => setSelected((s) => ({ ...s, [code]: !s[code] }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const categories = allCategories
        .filter((c) => selected[c.catCode])
        .map((c) => ({
          catCode: c.catCode,
          name: c.name,
          limit: limits[c.catCode] !== '' && limits[c.catCode] != null ? Number(limits[c.catCode]) : null,
        }));
      await api.updateDevoteeCategories(event.id, categories);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateDevoteeCategories(event.id, null);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qr-modal-backdrop" onClick={onClose}>
      <div className="qr-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Configure: {event.name}</h2>
          <button className="qr-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="sub" style={{ marginBottom: 12 }}>
          Choose which pass types devotees can issue from the app for this event. Set limits or leave blank for unlimited.
        </p>
        {loading ? (
          <div className="loading">Loading categories…</div>
        ) : allCategories.length === 0 ? (
          <p className="muted">No categories found for this event on the main system.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {allCategories.map((c) => (
              <div key={c.catCode} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: selected[c.catCode] ? 'var(--accent-bg, #f0f4ff)' : 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={!!selected[c.catCode]}
                    onChange={() => toggle(c.catCode)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 500 }}>{c.name || c.catCode}</span>
                  <span className="sub" style={{ fontSize: '0.75rem' }}>({c.catCode})</span>
                </label>
                {selected[c.catCode] && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      style={{ width: 70, padding: '4px 8px', fontSize: '0.85rem' }}
                      placeholder="Max"
                      value={limits[c.catCode] ?? ''}
                      onChange={(e) => setLimits((l) => ({ ...l, [c.catCode]: e.target.value }))}
                    />
                    <span className="sub" style={{ fontSize: '0.7rem' }}>{c.used ?? 0} used</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={saving}>
            Show all (clear restrictions)
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || loading}>
            <CheckIcon size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ name: '', event_code: '', location: '', date: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [configEvent, setConfigEvent] = useState(null);

  const load = () => {
    api
      .events({ live: 1 })
      .then(({ events }) => setEvents(events))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api
      .me()
      .then(({ user }) => setIsAdmin(user.role === 'admin'))
      .catch(() => setIsAdmin(false));
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
      if (Array.isArray(syncedEvents) && syncedEvents.length > 0) {
        setEvents(syncedEvents);
      } else {
        load();
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
                      {ev.date ? ` · ${parseDate(ev.date).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <span className="badge">{ev.pass_count} pass(es)</span>
                  {isAdmin && ev.event_code && (
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Configure devotee pass types"
                      onClick={() => setConfigEvent(ev)}
                    >
                      <SettingsIcon size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {configEvent && (
        <ConfigureModal
          event={configEvent}
          onClose={() => setConfigEvent(null)}
          onSaved={() => { setConfigEvent(null); load(); }}
        />
      )}
    </div>
  );
}
