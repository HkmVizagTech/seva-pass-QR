import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadQrPng, parseDate } from '../api.js';
import {
  ListIcon,
  DownloadIcon,
  EyeIcon,
  TicketIcon,
  WhatsAppIcon,
} from '../components/icons.jsx';

const STATUS = ['', 'unused', 'used', 'revoked'];

function whatsappUrl(phone, passToken, donorName) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? '91' + digits : digits;
  const passUrl = `${window.location.origin}/pass?t=${passToken}`;
  const text = `Hare Krishna ${donorName}! Here is your seva pass:\n\n${passUrl}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

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

  const revoke = async (id) => {
    if (!window.confirm('Revoke this pass? It can no longer be used.')) return;
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

  const pngName = (p) => `${p.donor_name.replace(/\s+/g, '-')}-pass.png`;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><ListIcon size={22} /></span>
          <div>
            <h1>All Passes</h1>
            <p>{passes.length} pass(es) shown</p>
          </div>
        </div>
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
        <div className="alert alert-info" style={{ margin: 0 }}>No passes match your filters.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-wrap pass-card-row">
            <table className="table">
              <thead>
                <tr>
                  <th>Donor / Invitee</th>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Status</th>
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
                    <td>{p.issuer_name || '—'}</td>
                    <td className="ta-r">
                      <div className="actions">
                        <Link className="btn btn-ghost btn-sm" to={`/pass?t=${p.token}`}>
                          <EyeIcon size={14} /> Card
                        </Link>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => downloadQrPng(p.id, pngName(p))}
                        >
                          <DownloadIcon size={14} /> PNG
                        </button>
                        {p.status !== 'revoked' && (
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busyId === p.id}
                            onClick={() => revoke(p.id)}
                          >
                            Revoke
                          </button>
                        )}
                        {p.phone && (
                          <a
                            className="btn btn-ghost btn-sm"
                            href={whatsappUrl(p.phone, p.token, p.donor_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <WhatsAppIcon size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="pass-list-cards">
            {passes.map((p) => (
              <div key={p.id} className="pass-item fade-up">
                <div className="pass-item-head">
                  <div>
                    <div className="pass-item-name">{p.donor_name}</div>
                    <div className="pass-item-sub">
                      {p.phone || p.email || ''}
                      {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                    </div>
                  </div>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </div>

                <div className="pass-item-meta">
                  <div><b>Type</b>{p.pass_type}</div>
                  <div><b>Event</b>{p.event_name || '—'}</div>
                  <div><b>Issued by</b>{p.issuer_name || '—'}</div>
                </div>

                <div className="pass-item-actions">
                  <Link className="btn btn-ghost btn-sm" to={`/pass?t=${p.token}`}>
                    <TicketIcon size={14} /> Card
                  </Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadQrPng(p.id, pngName(p))}>
                    <DownloadIcon size={14} /> PNG
                  </button>
                  {p.status !== 'revoked' && (
                    <button className="btn btn-danger btn-sm" disabled={busyId === p.id} onClick={() => revoke(p.id)}>
                      Revoke
                    </button>
                  )}
                  {p.phone && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={whatsappUrl(p.phone, p.token, p.donor_name)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon size={14} /> WA
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
