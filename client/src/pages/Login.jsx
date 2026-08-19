import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function Login() {
  const [mode, setMode] = useState('preacher');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'preacher') {
        const loginEmail = email.trim();
        if (!loginEmail) {
          setError('Email is required');
          setLoading(false);
          return;
        }
        const { token } = await api.preacherLogin({ email: loginEmail, password });
        setToken(token);
      } else {
        const loginUsername = username.trim();
        if (!loginUsername) {
          setError('Username is required');
          setLoading(false);
          return;
        }
        const { token } = await api.login(loginUsername, password);
        setToken(token);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
  };

  return (
    <div className="login-page">
      <div className="login-card fade-up">
        <div className="login-brand">
          <span className="brand-logo large">ॐ</span>
          <h1>Seva Pass</h1>
          <p>QR entry pass manager for devotees</p>
          <div className="login-kicker">
            Janmashtami · Hare Krishna
          </div>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'preacher' ? 'active' : ''}`}
            onClick={() => switchMode('preacher')}
            type="button"
          >
            Preacher Login
          </button>
          <button
            className={`login-tab ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => switchMode('admin')}
            type="button"
          >
            Admin Login
          </button>
        </div>

        <form onSubmit={submit} className="form">
          {mode === 'admin' ? (
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
                placeholder="Enter your username"
              />
            </label>
          ) : (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
                placeholder="Enter your email"
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {import.meta.env.DEV && (
          <p className="login-hint">
            Admin: <code>admin</code> / <code>admin123</code> · Preacher: email + password from main system
          </p>
        )}
      </div>
    </div>
  );
}
