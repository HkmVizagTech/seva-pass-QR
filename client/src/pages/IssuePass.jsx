import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiOrigin, downloadQrPng } from '../api.js';
import { QrIcon, DownloadIcon, ExternalIcon, CheckIcon, WhatsAppIcon } from '../components/icons.jsx';

const PASS_TYPES = ['General', 'VIP', 'Donor', 'Volunteer', 'Staff', 'Media'];
const EMPTY = { donor_name: '', phone: '', email: '', pass_type: 'General', event_id: '' };

function whatsappUrl(phone, passToken, donorName) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? '91' + digits : digits;
  const passUrl = `${window.location.origin}/pass?t=${passToken}`;
  const text = `Hare Krishna ${donorName}! Here is your seva pass:\n\n${passUrl}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

export default function IssuePass() {
  const [form, setForm] = useState(EMPTY);
  const [events, setEvents] = useState([]);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState(null);
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState('');

  useEffect(() => {
    api
      .stats()
      .then(({ stats }) => setQuota(stats.quota))
      .catch(() => {});
    api
      .events()
      .then(({ events }) => setEvents(events))
      .catch(() => {});
  }, []);

  // Fetch venues when an event with an event_code is selected
  useEffect(() => {
    if (!form.event_id) {
      setVenues([]);
      setSelectedVenue('');
      return;
    }
    const ev = events.find((e) => e.id === form.event_id);
    if (!ev?.event_code) {
      setVenues([]);
      setSelectedVenue('');
      return;
    }
    api
      .venues(ev.event_code)
      .then(({ venues }) => {
        setVenues(venues || []);
        setSelectedVenue('');
      })
      .catch(() => {
        setVenues([]);
        setSelectedVenue('');
      });
  }, [form.event_id, events]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { pass } = await api.createPass({
        donor_name: form.donor_name,
        phone: form.phone,
        email: form.email,
        pass_type: form.pass_type,
        event_id: form.event_id || null,
        venue: selectedVenue || '',
        baseUrl: apiOrigin(),
      });
      setCreated(pass);
      setForm(EMPTY);
      setSelectedVenue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pct = quota ? Math.round((quota.used / quota.limit) * 100) : 0;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><QrIcon size={22} /></span>
          <div>
            <h1>Issue Pass</h1>
            <p>Enter the devotee's name and phone to get their QR pass</p>
          </div>
        </div>
      </header>

      <div className="two-col">
        <section className="panel">
          <form onSubmit={submit} className="form">
            {error && <div className="alert alert-error">{error}</div>}

            {quota && (
              <div style={{ marginBottom: 14 }}>
                <div className="alert" style={{ margin: 0, padding: '12px 14px', background: quota.used >= quota.limit ? 'var(--red-bg)' : '#fdf4e0', border: '1px solid ' + (quota.used >= quota.limit ? '#f3c1c1' : 'var(--saffron-400)'), color: quota.used >= quota.limit ? 'var(--red)' : 'var(--saffron-700)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem' }}>
                    <span>My quota</span>
                    <span>{quota.used} / {quota.limit} used</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: '#e6d9bd', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 999, background: quota.used >= quota.limit ? 'var(--red)' : 'var(--brand-gradient)' }} />
                  </div>
                </div>
                {quota.used >= quota.limit && (
                  <p className="sub" style={{ margin: '6px 2px 0' }}>Quota reached — revoke an unused pass to issue more.</p>
                )}
              </div>
            )}

            <label>
              Devotee name *
              <input value={form.donor_name} onChange={set('donor_name')} required placeholder="e.g. Krishna Das" autoComplete="off" />
            </label>
            <label>
              Phone number *
              <input
                value={form.phone}
                onChange={set('phone')}
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. 9876543210"
              />
            </label>
            <div className="form-row">
              <label>
                Email (optional)
                <input type="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="devotee@example.com" />
              </label>
              <label>
                Pass type
                <select value={form.pass_type} onChange={set('pass_type')}>
                  {PASS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Event (optional)
              <select value={form.event_id} onChange={set('event_id')}>
                <option value="">No event selected</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </label>

            {venues.length > 0 && (
              <div className="ep-select">
                <label style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
                  Venue (optional)
                </label>
                <p className="sub" style={{ margin: '0 0 8px' }}>Select which venue this pass is for</p>
                <div className="ep-grid">
                  {venues.map((v) => (
                    <label key={v.name} className={`ep-chip ${selectedVenue === v.name ? 'ep-active' : ''}`}>
                      <input
                        type="radio"
                        name="venue"
                        checked={selectedVenue === v.name}
                        onChange={() => setSelectedVenue(selectedVenue === v.name ? '' : v.name)}
                      />
                      <span className="ep-name">{v.name}</span>
                      {v.address && <span className="ep-type">{v.address}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Getting QR pass…' : 'Get QR pass'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Preview</h2>
          {created ? (
            <div className="pass-card fade-up">
              {created.source === 'main-system' && (
                <div className="badge badge-main">main system</div>
              )}
              <div className="pass-card-qr">
                <img src={created.qr_image || created.qr_svg} alt={`QR pass for ${created.donor_name}`} />
              </div>
              <div className="pass-card-name">{created.donor_name}</div>
              <div className="pass-card-type">{created.pass_type}{created.phone ? ` · ${created.phone}` : ''}</div>
              {created.event_name && <div className="sub">{created.event_name}</div>}
              <div className="sub">Token: <code>{created.token}</code></div>
              <div className="pass-card-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => downloadQrPng(created.id, `${created.donor_name.replace(/\s+/g, '-')}-pass.png`)}
                >
                  <DownloadIcon size={15} /> Download PNG
                </button>
                <Link className="btn btn-ghost btn-sm" to={`/pass?t=${created.token}`}>
                  <ExternalIcon size={15} /> Open card
                </Link>
                {created.phone && (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={whatsappUrl(created.phone, created.token, created.donor_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon size={15} /> WhatsApp
                  </a>
                )}
              </div>
              <div className="sub" style={{ marginTop: 10 }}>
                <CheckIcon size={13} /> Pass issued successfully
              </div>
            </div>
          ) : (
            <div className="muted" style={{ textAlign: 'center', padding: '30px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <QrIcon size={40} style={{ opacity: 0.35 }} />
              <span>Enter the name and phone number to get the QR pass here.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
