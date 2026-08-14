import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, clearToken } from '../api.js';

export default function Layout() {
  const [user, setUser] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => {
        clearToken();
        navigate('/login');
      });
  }, []);

  const logout = () => {
    clearToken();
    navigate('/login');
  };

  const closeNav = () => setNavOpen(false);

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={closeNav} />

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">ॐ</span>
          <div>
            <div className="brand-title">Seva Pass</div>
            <div className="brand-sub">Entry Pass Manager</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end onClick={closeNav}>Dashboard</NavLink>
          <NavLink to="/issue" onClick={closeNav}>Issue Pass</NavLink>
          <NavLink to="/passes" onClick={closeNav}>All Passes</NavLink>
          <NavLink to="/events" onClick={closeNav}>Events</NavLink>
          {user && user.role === 'admin' && (
            <NavLink to="/users" onClick={closeNav}>Devotees &amp; Quotas</NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          {user && (
            <div className="user-chip">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role} · @{user.username}</div>
            </div>
          )}
          <button className="btn btn-ghost btn-block" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
          >
            {navOpen ? '✕' : '☰'}
          </button>
          <span className="topbar-title">Seva Pass</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
