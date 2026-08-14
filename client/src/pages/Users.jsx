import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { UsersIcon, PlusIcon, EditIcon } from '../components/icons.jsx';

const ROLES = ['admin', 'devotee'];
const EMPTY = { username: '', password: '', name: '', role: 'devotee', quota: 30 };

export default function Users() {
  const [users, setUsers] = useState([]);
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

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: key === 'quota' ? Number(e.target.value) : e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.createUser(form);
      setSuccess(`Devotee "${form.name}" created.`);
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
    setEditForm({ name: u.name, role: u.role, quota: u.quota, password: '' });
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
                          <td><span className={`badge ${u.role === 'admin' ? 'badge-main' : ''}`}>{u.role}</span></td>
                          <td>{u.quota}</td>
                          <td>
                            {u.used}{' '}
                            <span className={`badge ${u.used >= u.quota ? 'badge-revoked' : ''}`}>
                              {u.used >= u.quota ? 'full' : `${u.quota - u.used} left`}
                            </span>
                          </td>
                          <td className="ta-r">
                            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>
                              <EditIcon size={14} /> Edit
                            </button>
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
