import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, clearToken } from '../api.js';
import {
  DashboardIcon,
  QrIcon,
  ListIcon,
  CalendarIcon,
  UsersIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
} from './icons.jsx';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Dashboard', icon: DashboardIcon },
  { to: '/issue', label: 'Issue Pass', icon: QrIcon },
  { to: '/passes', label: 'All Passes', icon: ListIcon },
  { to: '/events', label: 'Events', icon: CalendarIcon },
  { to: '/users', label: 'Devotees', icon: UsersIcon, adminOnly: true },
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

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
  const isAdmin = user?.role === 'admin';
  const isDevotee = !isAdmin;
  const items = NAV_ITEMS
    .filter((i) => !i.adminOnly || isAdmin)
    .map((i) =>
      i.to === '/passes' ? { ...i, label: isDevotee ? 'My Passes' : 'All Passes' } : i
    );

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={closeNav} />

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">ॐ</span>
          <div>
            <div className="brand-title">Seva Pass</div>
            <div className="brand-sub">ISKCON Visakhapatnam</div>
          </div>
        </div>

        <nav className="nav">
          {items.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} onClick={closeNav}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="user-chip">
              <span className="user-avatar">{initials(user.name)}</span>
              <div className="user-meta">
                <div className="user-name">{user.name}</div>
                <div className="user-role">
                  {user.role}
                  {user.shortCode ? ` · ${user.shortCode}` : ` · @${user.username}`}
                </div>
              </div>
            </div>
          )}
          <button className="btn btn-ghost btn-block" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={logout}>
            <LogoutIcon size={17} /> Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-toggle" onClick={() => setNavOpen((v) => !v)} aria-label={navOpen ? 'Close menu' : 'Open menu'}>
            {navOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
          <div className="topbar-brand">
            <span className="brand-logo">ॐ</span>
            <span className="topbar-title">Seva Pass</span>
          </div>
          <div className="topbar-spacer" />
          {user && (
            <button
              className="menu-toggle"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              style={{ width: 42, height: 42 }}
            >
              <LogoutIcon size={18} />
            </button>
          )}
        </div>

        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Primary">
        <div className="tabbar-inner">
          {items.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <Icon size={22} />
              <span>{label}</span>
              <span className="tab-dot" />
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
