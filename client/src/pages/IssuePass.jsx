import React, { useEffect, useState } from 'react';
import { api, downloadQrPng } from '../api.js';

const TYPES = ['General', 'VIP', 'Donor', 'Volunteer', 'Staff', 'Media'];

const EMPTY = {
  donor_name: '',
  phone: '',
  email: '',
  pass_type: 'General',
  event_id: '',
  valid_from: '',
  valid_until: '',
  notes: '',
};

export default function IssuePass() {
  const [form, setForm] = useState(EMPTY);
  const [events, setEvents] = useState([]);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    api
      .events()
      .then(({ events }) => setEvents(events))
      .catch(() => {});
    api
      .stats()
      .then(({ stats }) => setQuota(stats.quota))
      .catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { pass } = await api.createPass({
        ...form,
        event_id: form.event_id || null,
        baseUrl: window.location.origin,
      });
      setCreated(pass);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1>Issue Pass</h1>
        <p>Generate a QR entry pass for a donor or invitee</p>
      </header>

      <div className="two-col">
        <section className="panel">
          <form onSubmit={submit} className="form">
            {error && <div className="alert alert-error">{error}</div>}
            <label>
              Donor / Invitee name *
              <input value={form.donor_name} onChange={set('donor_name')} required placeholder="e.g. Krishna Das" />
            </label>
            {quota && (
              <div className={`alert ${quota.used >= quota.limit ? 'alert-error' : 'alert-info'}`}>
                My quota: <strong>{quota.used} / {quota.limit}</strong> passes used
                {quota.used >= quota.limit && ' — quota reached. Revoke an unused pass to issue more.'}
              </div>
            )}
            <div className="form-row">
              <label>
                Phone *
                <input value={form.phone} onChange={set('phone')} required placeholder="+91 … (used to claim the QR)" />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Pass type
                <select value={form.pass_type} onChange={set('pass_type')}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Event
                <select value={form.event_id} onChange={set('event_id')}>
                  <option value="">— No event —</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Valid from
                <input type="date" value={form.valid_from} onChange={set('valid_from')} />
              </label>
              <label>
                Valid until
                <input type="date" value={form.valid_until} onChange={set('valid_until')} />
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Optional remarks" />
            </label>
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Generating…' : 'Generate QR pass'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Preview</h2>
          {created ? (
            <div className="pass-card">
              <div className="pass-card-qr">
                <img src={created.qr_image || created.qr_svg} alt={`QR pass for ${created.donor_name}`} />
              </div>
              <div className="pass-card-details">
                <div className="pass-card-name">{created.donor_name}</div>
                <div className="pass-card-type">{created.pass_type}</div>
                <div className="sub">Token: <code>{created.token}</code></div>
              </div>
              <div className="pass-card-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => downloadQrPng(created.id, `${created.donor_name.replace(/\s+/g, '-')}-pass.png`)}
                >
                  Download PNG
                </button>
                <a className="btn btn-ghost" href={`/pass?t=${created.token}`} target="_blank" rel="noreferrer">
                  Open pass card
                </a>
              </div>
              {created.source === 'main-system' && (
                <p className="sub">QR issued by the main ISKCON pass system · id {created.main_qr_id}</p>
              )}
            </div>
          ) : (
            <p className="muted">Fill the form and generate a pass to see its QR here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
