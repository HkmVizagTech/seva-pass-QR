import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, clearToken } from '../api.js';

export default function Layout() {
  const [user, setUser] = useState(null);
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">ॐ</span>
          <div>
            <div className="brand-title">Seva Pass</div>
            <div className="brand-sub">Entry Pass Manager</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/issue">Issue Pass</NavLink>
          <NavLink to="/passes">All Passes</NavLink>
          <NavLink to="/scan">Scan &amp; Validate</NavLink>
          <NavLink to="/events">Events</NavLink>
          {user && user.role === 'admin' && <NavLink to="/users">Devotees &amp; Quotas</NavLink>}
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
        <Outlet />
      </main>
    </div>
  );
}
