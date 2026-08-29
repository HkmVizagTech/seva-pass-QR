import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { UsersIcon, PlusIcon, EditIcon, TrashIcon } from '../components/icons.jsx';

const ROLES = ['admin', 'devotee'];
const EMPTY = { username: '', password: '', name: '', role: 'devotee', quota: 30, short_code: '', email: '', phone: '' };
const EMPTY_EDIT = { name: '', role: 'devotee', quota: 30, short_code: '', password: '', event_quotas: {} };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [addEventId, setAddEventId] = useState('');
  const [addEventQuota, setAddEventQuota] = useState(30);

  const load = () => {
    setError('');
    api
      .users()
      .then(({ users }) => setUsers(users))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);
  useEffect(() => {
    api.me().then(({ user }) => setCurrentUser(user)).catch(() => {});
    api.events().then(({ events }) => setEvents(events || [])).catch(() => {});
  }, []);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: key === 'quota' ? Number(e.target.value) : e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.createUser(form);
      setSuccess(`"${form.name}" created.`);
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (u) => {
    setEditing(u.id);
    setEditForm({
      name: u.name,
      role: u.role,
      quota: u.quota,
      short_code: u.short_code || '',
      password: '',
      event_quotas: { ...(u.event_quotas || {}) },
    });
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.updateUser(editing, editForm);
      setSuccess('User updated.');
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const editSet = (key) => (e) =>
    setEditForm((f) => ({ ...f, [key]: key === 'quota' ? Number(e.target.value) : e.target.value }));

  const deleteUser = async (u) => {
    if (currentUser && u.id === currentUser.id) {
      setError('Cannot delete your own account.');
      return;
    }
    if (!window.confirm(`Delete "${u.name}"? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.deleteUser(u.id);
      setSuccess(`"${u.name}" deleted.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><UsersIcon size={22} /></span>
          <div>
            <h1>Devotees &amp; Quotas</h1>
            <p>Create devotees and set how many passes each may hold</p>
          </div>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="two-col">
        <section className="panel">
          <h2>Add devotee</h2>
          <form onSubmit={create} className="form">
            <label>
              Full name *
              <input value={form.name} onChange={set('name')} required placeholder="e.g. Radha Krishna Das" autoComplete="off" />
            </label>
            <label>
              Username *
              <input value={form.username} onChange={set('username')} required placeholder="e.g. radhakrishna" autoComplete="off" />
            </label>
            <label>
              Password *
              <input type="password" value={form.password} onChange={set('password')} required placeholder="Temporary password" autoComplete="new-password" />
            </label>
            <label>
              Preacher code (short code on main site, e.g. MKGD)
              <input
                value={form.short_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, short_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))
                }
                placeholder="e.g. MKGD"
                autoComplete="off"
              />
              <span className="sub" style={{ fontSize: '0.75rem' }}>Passes issued by this devotee are attributed to this code.</span>
            </label>
            {form.role !== 'admin' && (
              <>
                <label>
                  Email * (used to log in on main system)
                  <input type="email" value={form.email} onChange={set('email')} required placeholder="devotee@example.com" autoComplete="off" />
                </label>
                <label>
                  Phone (alternative to email)
                  <input value={form.phone} onChange={set('phone')} placeholder="9876543210" autoComplete="off" />
                </label>
              </>
            )}
            <div className="form-row">
              <label>
                Role
                <select value={form.role} onChange={set('role')}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Quota (max passes)
                <input type="number" min="1" inputMode="numeric" value={form.quota} onChange={set('quota')} />
              </label>
            </div>
            <button className="btn btn-primary" disabled={loading}>
              <PlusIcon size={16} /> {loading ? 'Saving…' : 'Create devotee'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>All devotees</h2>
          {users.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Role</th>
                    <th>Quota</th>
                    <th>Used</th>
                    <th className="ta-r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      {editing === u.id && editForm ? (
                        <td colSpan="5">
                          <form onSubmit={saveEdit} className="form">
                            <div className="form-row">
                              <label>
                                Name
                                <input value={editForm.name} onChange={editSet('name')} required />
                              </label>
                              <label>
                                Code
                                <input
                                  value={editForm.short_code}
                                  onChange={(e) =>
                                    setEditForm((f) => ({ ...f, short_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))
                                  }
                                  placeholder="MKGD"
                                />
                              </label>
                              <label>
                                Role
                                <select value={editForm.role} onChange={editSet('role')}>
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Quota
                                <input type="number" min="1" inputMode="numeric" value={editForm.quota} onChange={editSet('quota')} />
                              </label>
                              <label>
                                New password (optional)
                                <input type="password" value={editForm.password} onChange={editSet('password')} placeholder="Leave blank to keep" autoComplete="new-password" />
                              </label>
                            </div>
                            {events.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <span className="sub" style={{ fontSize: '0.75rem' }}>Per-event quotas (overrides global quota for that event):</span>
                                {Object.entries(editForm.event_quotas || {}).map(([evId, q]) => (
                                  <div key={evId} className="form-row" style={{ alignItems: 'end', gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: '0.82rem', flex: 1 }}>
                                      {events.find((e) => e.id === evId)?.name || evId}
                                    </span>
                                    <input
                                      type="number"
                                      min="1"
                                      inputMode="numeric"
                                      style={{ width: 80 }}
                                      value={q}
                                      onChange={(e) =>
                                        setEditForm((f) => ({
                                          ...f,
                                          event_quotas: { ...f.event_quotas, [evId]: Number(e.target.value) || 1 },
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      style={{ color: 'var(--red)', padding: '4px 8px' }}
                                      onClick={() =>
                                        setEditForm((f) => {
                                          const eq = { ...f.event_quotas };
                                          delete eq[evId];
                                          return { ...f, event_quotas: eq };
                                        })
                                      }
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <div className="form-row" style={{ alignItems: 'end', gap: 6, marginTop: 6 }}>
                                  <select
                                    className="input"
                                    style={{ flex: 1 }}
                                    value={addEventId}
                                    onChange={(e) => setAddEventId(e.target.value)}
                                  >
                                    <option value="">Add event quota…</option>
                                    {events
                                      .filter((ev) => !editForm.event_quotas?.[ev.id])
                                      .map((ev) => (
                                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                                      ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="1"
                                    inputMode="numeric"
                                    style={{ width: 80 }}
                                    placeholder="Quota"
                                    value={addEventQuota}
                                    onChange={(e) => setAddEventQuota(Number(e.target.value) || 30)}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                      if (addEventId) {
                                        setEditForm((f) => ({
                                          ...f,
                                          event_quotas: { ...f.event_quotas, [addEventId]: addEventQuota || 1 },
                                        }));
                                        setAddEventId('');
                                        setAddEventQuota(30);
                                      }
                                    }}
                                  >
                                    <PlusIcon size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="actions">
                              <button className="btn btn-primary btn-sm" disabled={loading}>Save</button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td>
                            {u.name}
                            <div className="sub">@{u.username}</div>
                          </td>
                          <td>
                            {u.short_code ? (
                              <span className="badge badge-main" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{u.short_code}</span>
                            ) : (
                              <span className="sub">—</span>
                            )}
                          </td>
                          <td><span className={`badge ${u.role === 'admin' ? 'badge-main' : ''}`}>{u.role}</span></td>
                          <td>
                            {u.main_system ? (
                              <span className="sub">Set quota</span>
                            ) : (
                              <>
                                {u.quota}
                                {u.event_quotas && Object.keys(u.event_quotas).length > 0 && (
                                  <div className="sub" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>
                                    {Object.entries(u.event_quotas).map(([evId, info]) => {
                                      const ev = events.find((e) => e.id === evId);
                                      return (
                                        <div key={evId}>
                                          {ev?.name || evId}: {info.used}/{info.quota}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            {u.used}{' '}
                            {!u.main_system && (
                              <span className={`badge ${u.used >= u.quota ? 'badge-revoked' : ''}`}>
                                {u.used >= u.quota ? 'full' : `${u.quota - u.used} left`}
                              </span>
                            )}
                          </td>
                          <td className="ta-r">
                            <div className="actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>
                                <EditIcon size={14} /> Edit
                              </button>
                              {!u.main_system && (
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteUser(u)} aria-label={`Delete ${u.name}`}>
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
