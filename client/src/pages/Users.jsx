import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { UsersIcon, PlusIcon, EditIcon, TrashIcon, CloseIcon } from '../components/icons.jsx';

const ROLES = ['admin', 'devotee'];
const EMPTY = { username: '', password: '', name: '', role: 'devotee', quota: 30, short_code: '', email: '', phone: '' };

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
    // Deep copy event_quotas — support both old {eventId: num} and new {eventId: {catCode: num}}
    const eq = {};
    if (u.event_quotas) {
      for (const [evId, val] of Object.entries(u.event_quotas)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          eq[evId] = { ...val };
        } else {
          eq[evId] = Number(val) || 0;
        }
      }
    }
    setEditing(u.id);
    setEditForm({
      name: u.name,
      role: u.role,
      quota: u.quota,
      short_code: u.short_code || '',
      password: '',
      event_quotas: eq,
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

  // Helper: get total passes used for an event across all categories
  const getEventUsed = (u, evId) => {
    if (!u.event_quotas || !u.event_quotas[evId]) return 0;
    const val = u.event_quotas[evId];
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return 0;
  };

  // Helper: get total passes allowed for an event across all categories
  const getEventTotal = (u, evId) => {
    if (!u.event_quotas || !u.event_quotas[evId]) return null;
    const val = u.event_quotas[evId];
    if (typeof val === 'object' && val !== null) {
      const total = Object.values(val).reduce((s, v) => s + (Number(v) || 0), 0);
      return total || null;
    }
    return Number(val) || null;
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
            </label>
            <div className="form-row">
              <label>
                Email *
                <input type="email" value={form.email} onChange={set('email')} required placeholder="Used to login on main system" autoComplete="off" />
              </label>
              <label>
                Phone
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="Optional" autoComplete="off" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Global quota
                <input type="number" min="1" inputMode="numeric" value={form.quota} onChange={set('quota')} />
              </label>
              <label>
                Role
                <select value={form.role} onChange={set('role')}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>
            <button className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
              <PlusIcon size={16} /> Create devotee
            </button>
          </form>
        </section>

        <section className="panel" style={{ overflow: 'visible' }}>
          <h2>All devotees ({users.length})</h2>
          {users.length === 0 ? (
            <p className="sub" style={{ textAlign: 'center', padding: 20 }}>No devotees yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map((u) => (
                <div key={u.id} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: '#fff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                      <div className="sub" style={{ fontSize: '0.78rem' }}>
                        @{u.username}
                        {u.email && <span style={{ marginLeft: 6 }}>· {u.email}</span>}
                        {u.short_code && <span style={{ marginLeft: 6, fontFamily: 'monospace', letterSpacing: 1 }}>· {u.short_code}</span>}
                        <span style={{ marginLeft: 6 }}>· {u.role}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>
                        <EditIcon size={14} /> Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteUser(u)}>
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Quota summary */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ fontSize: '0.75rem' }}>
                      Global: {u.used}/{u.quota}
                    </span>
                    {Object.keys(u.event_quotas || {}).map((evId) => {
                      const ev = events.find((e) => e.id === evId);
                      const total = getEventTotal(u, evId);
                      const used = getEventUsed(u, evId);
                      return (
                        <span key={evId} className="badge badge-main" style={{ fontSize: '0.75rem' }}>
                          {ev?.name || evId}: {used}/{total}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ─── Edit Modal ──────────────────────────────────────────────── */}
      {editing && editForm && (
        <div className="qr-modal-backdrop" onClick={cancelEdit}>
          <div className="qr-modal" style={{ maxWidth: 520, maxHeight: '85dvh' }} onClick={(e) => e.stopPropagation()}>
            <button className="qr-modal-close" onClick={cancelEdit}><CloseIcon size={14} /></button>
            <b style={{ fontSize: '1rem', display: 'block', marginBottom: 14, paddingRight: 32 }}>
              Edit — {editForm.name}
            </b>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={saveEdit} className="form">
              <div className="form-row">
                <label>
                  Name *
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
                </label>
                <label>
                  Code
                  <input
                    value={editForm.short_code}
                    onChange={(e) => setEditForm((f) => ({ ...f, short_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))}
                    placeholder="MKGD"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Role
                  <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>
                  Global quota
                  <input type="number" min="1" inputMode="numeric" value={editForm.quota} onChange={(e) => setEditForm((f) => ({ ...f, quota: Number(e.target.value) || 1 }))} />
                </label>
              </div>
              <label>
                New password (leave blank to keep)
                <input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep" autoComplete="new-password" />
              </label>

              {/* ─── Per-Event Category Quotas ────────────────────────── */}
              {events.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>
                    Per-Event Category Quotas
                  </div>
                  <div className="sub" style={{ fontSize: '0.75rem', marginBottom: 8 }}>
                    Set how many passes of each type this devotee can issue per event.
                    Leave at 0 to use the global quota.
                  </div>
                  <EventCategoryQuotas
                    events={events}
                    eventQuotas={editForm.event_quotas || {}}
                    onChange={(eq) => setEditForm((f) => ({ ...f, event_quotas: eq }))}
                  />
                </div>
              )}

              <div className="actions" style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" disabled={loading}>Save</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Per-Event Category Quotas Component ────────────────────────────────────
function EventCategoryQuotas({ events, eventQuotas, onChange }) {
  const [expanded, setExpanded] = useState(null);
  const [newCat, setNewCat] = useState({});
  const [catEvents, setCatEvents] = useState({});
  const [catLimits, setCatLimits] = useState({});

  // Fetch categories for events that have quotas
  useEffect(() => {
    const eventIds = Object.keys(eventQuotas);
    for (const evId of eventIds) {
      if (catEvents[evId]) continue;
      const ev = events.find((e) => e.id === evId);
      if (!ev?.event_code) continue;
      api.categories(ev.event_code).then(({ categories }) => {
        setCatEvents((prev) => ({ ...prev, [evId]: categories || [] }));
      }).catch(() => {});
    }
  }, [eventQuotas, events]);

  const addEvent = (evId) => {
    onChange({ ...eventQuotas, [evId]: {} });
    setExpanded(evId);
  };

  const removeEvent = (evId) => {
    const next = { ...eventQuotas };
    delete next[evId];
    onChange(next);
  };

  const setCategoryQuota = (evId, catCode, value) => {
    const evQuotas = { ...(eventQuotas[evId] || {}) };
    const num = Number(value) || 0;
    if (num <= 0) {
      delete evQuotas[catCode];
    } else {
      evQuotas[catCode] = num;
    }
    if (Object.keys(evQuotas).length === 0) {
      const next = { ...eventQuotas };
      delete next[evId];
      onChange(next);
    } else {
      onChange({ ...eventQuotas, [evId]: evQuotas });
    }
  };

  const addCategory = (evId) => {
    const catCode = newCat[evId];
    const limit = Number(catLimits[evId]) || 10;
    if (!catCode) return;
    setCategoryQuota(evId, catCode, limit);
    setNewCat((p) => ({ ...p, [evId]: '' }));
    setNewLimits((p) => ({ ...p, [evId]: '' }));
  };

  const [newLimits, setNewLimits] = useState({});

  const eventEntries = Object.entries(eventQuotas);
  const availableEvents = events.filter((ev) => !eventQuotas[ev.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {eventEntries.map(([evId, cats]) => {
        const ev = events.find((e) => e.id === evId);
        const categories = catEvents[evId] || [];
        const isExpanded = expanded === evId;
        const catEntries = typeof cats === 'object' && cats !== null ? Object.entries(cats) : [];
        const total = catEntries.reduce((s, [, v]) => s + (Number(v) || 0), 0);

        return (
          <div key={evId} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', cursor: 'pointer', background: isExpanded ? '#fdf8ee' : '#fafaf7' }}
              onClick={() => setExpanded(isExpanded ? null : evId)}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ev?.name || evId}</span>
                {total > 0 && <span className="sub" style={{ marginLeft: 6, fontSize: '0.78rem' }}>({total} total)</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 6px', fontSize: '0.75rem' }}
                  onClick={(e) => { e.stopPropagation(); removeEvent(evId); }}>✕</button>
              </div>
            </div>
            {isExpanded && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: '#fff' }}>
                {catEntries.map(([catCode, limit]) => (
                  <div key={catCode} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: '0.82rem' }}>{catCode}</span>
                    <input
                      type="number" min="0" inputMode="numeric"
                      style={{ width: 60, padding: '4px 6px', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 6 }}
                      value={limit}
                      onChange={(e) => setCategoryQuota(evId, catCode, e.target.value)}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 6px' }}
                      onClick={() => setCategoryQuota(evId, catCode, 0)}>✕</button>
                  </div>
                ))}
                {/* Add category */}
                {categories.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                    <select
                      className="input"
                      style={{ flex: 1, fontSize: '0.82rem', padding: '4px 6px' }}
                      value={newCat[evId] || ''}
                      onChange={(e) => setNewCat((p) => ({ ...p, [evId]: e.target.value }))}
                    >
                      <option value="">Add category…</option>
                      {categories
                        .filter((c) => !catEntries.some(([code]) => code === c.catCode))
                        .map((c) => (
                          <option key={c.catCode} value={c.catCode}>{c.name} ({c.catCode})</option>
                        ))}
                    </select>
                    <input
                      type="number" min="1" inputMode="numeric"
                      style={{ width: 50, padding: '4px 6px', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 6 }}
                      placeholder="Limit"
                      value={newLimits[evId] || ''}
                      onChange={(e) => setNewLimits((p) => ({ ...p, [evId]: e.target.value }))}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addCategory(evId)}>
                      <PlusIcon size={14} />
                    </button>
                  </div>
                )}
                {categories.length === 0 && (
                  <div className="sub" style={{ fontSize: '0.78rem', textAlign: 'center', padding: 4 }}>
                    No categories configured for this event
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add event */}
      {availableEvents.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            className="input"
            style={{ flex: 1, fontSize: '0.82rem' }}
            value=""
            onChange={(e) => { if (e.target.value) addEvent(e.target.value); }}
          >
            <option value="">Add event quota…</option>
            {availableEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
