import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { MusicIcon } from '../components/icons.jsx';

// Two ways in:
//  - Admin / Devotee — app-local accounts (username + password).
//  - Preacher — a devotee account on the main ISKCON system (email or phone
//    + password). The app then acts as the preacher's own dashboard.
const MODES = [
  { key: 'admin', label: 'Admin / Devotee' },
  { key: 'preacher', label: 'Preacher' },
];

export default function Login() {
  const [mode, setMode] = useState('preacher');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isPreacher = mode === 'preacher';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = isPreacher
        ? await api.preacherLogin({ email: email.trim(), phone: phone.trim(), password })
        : await api.login(username.trim(), password);
      setToken(token);
      navigate('/');
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
            <MusicIcon size={13} /> Janmashtami · Hare Krishna <MusicIcon size={13} />
          </div>
        </div>

        <div className="login-modes">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`login-mode ${mode === m.key ? 'active' : ''}`}
              onClick={() => { setMode(m.key); setError(''); }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="form">
          {isPreacher ? (
            <>
              <label>
                Email or phone
                <input
                  value={email || phone}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d[\d\s+\-()]*$/.test(v)) {
                      setPhone(v);
                      setEmail('');
                    } else {
                      setEmail(v);
                      setPhone('');
                    }
                  }}
                  placeholder="devotee@iskconvizag.org or 9876543210"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </label>
            </>
          ) : (
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
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
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : isPreacher ? 'Sign in as preacher' : 'Sign in'}
          </button>
        </form>
        {!isPreacher && (
          <p className="login-hint">
            Default login: <code>admin</code> / <code>admin123</code>
          </p>
        )}
      </div>
    </div>
  );
}
