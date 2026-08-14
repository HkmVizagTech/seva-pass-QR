import React, { useEffect, useState } from 'react';
import { api, downloadQrPng } from '../api.js';

const EMPTY = { donor_name: '', phone: '' };

export default function IssuePass() {
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
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
        <p>Enter the devotee's name and phone number to get their QR pass from the main system</p>
      </header>

      <div className="two-col">
        <section className="panel">
          <form onSubmit={submit} className="form">
            {error && <div className="alert alert-error">{error}</div>}
            <label>
              Devotee name *
              <input value={form.donor_name} onChange={set('donor_name')} required placeholder="e.g. Krishna Das" />
            </label>
            <label>
              Phone number *
              <input
                value={form.phone}
                onChange={set('phone')}
                required
                type="tel"
                placeholder="e.g. 9876543210 (used to claim the QR)"
              />
            </label>
            {quota && (
              <div className={`alert ${quota.used >= quota.limit ? 'alert-error' : 'alert-info'}`}>
                My quota: <strong>{quota.used} / {quota.limit}</strong> passes used
                {quota.used >= quota.limit && ' — quota reached. Revoke an unused pass to issue more.'}
              </div>
            )}
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Getting QR from main system…' : 'Get QR pass'}
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
                <div className="pass-card-type">{created.phone || ''}</div>
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
            <p className="muted">Enter the name and phone number to get the QR pass here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
