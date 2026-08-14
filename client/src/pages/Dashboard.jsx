import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const CARDS = [
  { key: 'total', label: 'Total Passes', className: 'stat-total' },
  { key: 'unused', label: 'Unused', className: 'stat-unused' },
  { key: 'used', label: 'Checked In', className: 'stat-used' },
  { key: 'revoked', label: 'Revoked', className: 'stat-revoked' },
  { key: 'checked_today', label: "Checked In Today", className: 'stat-today' },
  { key: 'events', label: 'Events', className: 'stat-events' },
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
    <div>
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your seva passes</p>
      </header>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        {CARDS.map((c) => (
          <div key={c.key} className={`stat-card ${c.className}`}>
            <div className="stat-value">{stats[c.key] ?? 0}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
        {stats.quota && (
          <div className="stat-card stat-quota">
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
          <Link to="/passes" className="btn btn-ghost">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">No passes issued yet. <Link to="/issue">Issue your first pass</Link>.</p>
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
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
