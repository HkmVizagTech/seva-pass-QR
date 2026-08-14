import React, { useEffect, useState } from 'react';
import { api, downloadQrPng, parseDate } from '../api.js';

const STATUS = ['', 'unused', 'used', 'revoked'];

export default function PassList() {
  const [passes, setPasses] = useState([]);
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api
      .events()
      .then(({ events }) => setEvents(events))
      .catch(() => {});
  }, []);

  const load = () => {
    setError('');
    api
      .passes({ q, status, event_id: eventId })
      .then(({ passes }) => setPasses(passes))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [q, status, eventId]);

  const checkIn = async (token) => {
    setBusyId(token);
    try {
      await api.checkIn(token);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this pass? It can no longer be used.')) return;
    setBusyId(id);
    try {
      await api.revoke(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1>All Passes</h1>
        <p>{passes.length} pass(es) shown</p>
      </header>

      <div className="filters">
        <input
          className="input"
          placeholder="Search name, phone, email or token…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All statuses' : s}</option>
          ))}
        </select>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {passes.length === 0 ? (
        <p className="muted">No passes match your filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Donor / Invitee</th>
                <th>Type</th>
                <th>Event</th>
                <th>Status</th>
                <th>Checked in</th>
                <th>Issued by</th>
                <th className="ta-r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.donor_name}
                    <div className="sub">
                      {p.phone || p.email || ''}
                      {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                    </div>
                  </td>
                  <td>{p.pass_type}</td>
                  <td>{p.event_name || '—'}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>
                    {p.checked_in_at
                      ? parseDate(p.checked_in_at).toLocaleString()
                      : '—'}
                  </td>
                  <td>{p.issuer_name || '—'}</td>
                  <td className="ta-r">
                    <div className="actions">
                      <a className="btn btn-ghost btn-sm" href={`/pass?t=${p.token}`} target="_blank" rel="noreferrer">
                        Card
                      </a>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => downloadQrPng(p.id, `${p.donor_name.replace(/\s+/g, '-')}-pass.png`)}
                      >
                        PNG
                      </button>
                      {p.status === 'unused' && (
                        <button className="btn btn-sm" disabled={busyId === p.token} onClick={() => checkIn(p.token)}>
                          Check in
                        </button>
                      )}
                      {p.status !== 'revoked' && (
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={busyId === p.id}
                          onClick={() => revoke(p.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
