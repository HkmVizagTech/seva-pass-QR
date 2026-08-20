import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDateTime } from '../api.js';
import {
  TicketIcon,
  CalendarIcon,
  UsersIcon,
  RefreshIcon,
  GiftIcon,
  DashboardIcon,
  QrIcon,
} from '../components/icons.jsx';

const CARDS = [
  { key: 'total', label: 'Total Passes', className: 'stat-total', icon: TicketIcon },
  { key: 'unused', label: 'Unused', className: 'stat-unused', icon: GiftIcon },
  { key: 'revoked', label: 'Revoked', className: 'stat-revoked', icon: RefreshIcon },
  { key: 'events', label: 'Events', className: 'stat-events', icon: CalendarIcon },
];

// Preacher dashboard cards (data comes from the main system).
const MAIN_SYSTEM_CARDS = [
  { key: 'totalHolders', label: 'My Devotees', className: 'stat-total', icon: UsersIcon },
  { key: 'activePasses', label: 'Active Passes', className: 'stat-unused', icon: TicketIcon },
  { key: 'scannedPasses', label: 'Scanned', className: 'stat-events', icon: QrIcon },
  { key: 'scanRate', label: 'Scan Rate %', className: 'stat-quota', icon: GiftIcon, suffix: '' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  const load = () => {
    setError('');
    api
      .stats()
      .then((data) => {
        if (!data || !data.stats) throw new Error('The server sent an unexpected reply.');
        setStats(data.stats);
      })
      .catch((e) => setError(e.message));
    api
      .me()
      .then(({ user }) => {
        if (user.shortCode) {
          api
            .myHolders({ limit: 8 })
            .then(({ holders }) => setRecent(holders || []))
            .catch((e) => console.warn('Failed to load holders:', e.message));
          api
            .myStats()
            .then((data) => {
              if (data && data.stats) setStats(data.stats);
            })
            .catch(() => {});
        } else {
          api
            .passes()
            .then(({ passes }) => setRecent((passes || []).slice(0, 8)))
            .catch((e) => console.warn('Failed to load passes:', e.message));
        }
      })
      .catch(() => {});
  };

  useEffect(load, []);

  // Never spin forever: if the stats call failed, show why and offer a retry.
  if (!stats && error) {
    return (
      <div className="fade-up" style={{ padding: '24px 0' }}>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-primary btn-sm" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!stats) return <div className="loading">Loading…</div>;

  const isMainSystem = stats.main_system === true;
  const cards = isMainSystem ? MAIN_SYSTEM_CARDS : CARDS;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><DashboardIcon size={22} /></span>
          <div>
            <h1>Dashboard</h1>
            <p>{isMainSystem ? 'Your devotees and passes' : 'Overview of your seva passes'}</p>
          </div>
        </div>
      </header>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        {cards.map((c) => {
          const Icon = c.icon;
          const value = stats[c.key];
          return (
            <div key={c.key} className={`stat-card ${c.className}`}>
              <span className="stat-ico"><Icon size={18} /></span>
              <div className="stat-value">
                {value ?? 0}
                {c.suffix !== undefined && c.suffix !== null ? c.suffix : ''}
              </div>
              <div className="stat-label">{c.label}</div>
            </div>
          );
        })}
        {!isMainSystem && stats.quota && (
          <div className="stat-card stat-quota">
            <span className="stat-ico"><UsersIcon size={18} /></span>
            <div className="stat-value">
              {stats.quota.used} <span className="stat-slash">/ {stats.quota.limit}</span>
            </div>
            <div className="stat-label">My quota (passes used)</div>
          </div>
        )}
      </div>

      {isMainSystem && Array.isArray(stats.byEvent) && stats.byEvent.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>By festival</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th className="ta-r">Devotees</th>
                </tr>
              </thead>
              <tbody>
                {stats.byEvent.map((e) => (
                  <tr key={e._id || e.eventCode || e.eventName}>
                    <td>{e.eventName || e.eventCode || '—'}</td>
                    <td className="ta-r">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>{isMainSystem ? 'Recently issued under you' : 'Recently issued passes'}</h2>
          <Link to="/passes" className="btn btn-ghost btn-sm">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="alert alert-info" style={{ margin: 0 }}>
            No passes yet. <Link to="/issue">Issue your first pass</Link>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{isMainSystem ? 'Devotee' : 'Donor / Invitee'}</th>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => {
                  const name = isMainSystem ? (p.name || p.donor_name) : p.donor_name;
                  const type = isMainSystem ? p.catId?.name || p.catId?.catCode || '—' : p.pass_type;
                  const event = isMainSystem ? p.eventId?.name || p.eventId?.eventCode || '—' : p.event_name || '—';
                  const status = isMainSystem
                    ? p.qrPass?.status || 'no pass'
                    : p.status;
                  const phone = isMainSystem ? p.phone : (p.phone || p.email || '');
                  return (
                    <tr key={p.id || p._id}>
                      <td>
                        {name}
                        <div className="sub">{phone}</div>
                      </td>
                      <td>{type}</td>
                      <td>{event}</td>
                      <td>
                        <span className={`badge badge-${status}`}>{status}</span>
                        {isMainSystem && p.bahumanaReceived && (
                          <div className="sub" style={{ color: 'var(--green, #1a7f37)' }}>🎁 bahumana received</div>
                        )}
                      </td>
                      <td>{formatDateTime(p.created_at || p.issuedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {recent.length > 0 && (
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Link to="/issue" className="btn btn-primary btn-sm">
              <QrIcon size={15} /> Issue a new pass
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
