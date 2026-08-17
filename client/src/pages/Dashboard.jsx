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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api
      .stats()
      .then(({ stats }) => setStats(stats))
      .catch((e) => setError(e.message));
    api
      .passes()
      .then(({ passes }) => setRecent(passes.slice(0, 8)))
      .catch(() => {});
  }, []);

  if (!stats) return <div className="loading">Loading…</div>;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><DashboardIcon size={22} /></span>
          <div>
            <h1>Dashboard</h1>
            <p>Overview of your seva passes</p>
          </div>
        </div>
      </header>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className={`stat-card ${c.className}`}>
              <span className="stat-ico"><Icon size={18} /></span>
              <div className="stat-value">{stats[c.key] ?? 0}</div>
              <div className="stat-label">{c.label}</div>
            </div>
          );
        })}
        {stats.quota && (
          <div className="stat-card stat-quota">
            <span className="stat-ico"><UsersIcon size={18} /></span>
            <div className="stat-value">
              {stats.quota.used} <span className="stat-slash">/ {stats.quota.limit}</span>
            </div>
            <div className="stat-label">My quota (passes used)</div>
          </div>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recently issued passes</h2>
          <Link to="/passes" className="btn btn-ghost btn-sm">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="alert alert-info" style={{ margin: 0 }}>
            No passes issued yet. <Link to="/issue">Issue your first pass</Link>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Donor / Invitee</th>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.donor_name}
                      <div className="sub">{p.phone || p.email || ''}</div>
                    </td>
                    <td>{p.pass_type}</td>
                    <td>{p.event_name || '—'}</td>
                    <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                    <td>{formatDateTime(p.created_at)}</td>
                  </tr>
                ))}
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
