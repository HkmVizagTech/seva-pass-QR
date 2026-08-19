import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const val = identifier.trim();
      if (!val) {
        setError('Email or username is required');
        setLoading(false);
        return;
      }
      const isEmail = val.includes('@');
      if (isEmail) {
        // Email → try main system first, then local fallback
        try {
          const { token } = await api.preacherLogin({ email: val, password });
          setToken(token);
          navigate('/');
          return;
        } catch {
          // Main system rejected — try local
        }
        const { token } = await api.login(val, password);
        setToken(token);
        navigate('/');
      } else {
        // Username → try local first, then main system
        try {
          const { token } = await api.login(val, password);
          setToken(token);
          navigate('/');
          return;
        } catch {
          // Local rejected — try main system (user might have entered email without @)
        }
        const { token } = await api.preacherLogin({ email: val, password });
        setToken(token);
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={submit} className="form">
          <label>
            Email or username
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              placeholder="Enter your email or username"
            />
          </label>
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
            Admin: <code>admin</code> / <code>admin123</code> · Devotee: email + password from main system
          </p>
        )}
      </div>
    </div>
  );
}
