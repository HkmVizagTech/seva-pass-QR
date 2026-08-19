import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, siteOrigin, downloadQrPng, shareWhatsApp } from '../api.js';
import { QrIcon, DownloadIcon, ExternalIcon, CheckIcon, WhatsAppIcon, CalendarIcon } from '../components/icons.jsx';

const PASS_TYPES = ['General', 'VIP', 'Donor', 'Volunteer', 'Staff', 'Media'];
const EMPTY = { donor_name: '', phone: '', email: '', pass_type: 'General', event_id: '' };

export default function IssuePass() {
  const [form, setForm] = useState(EMPTY);
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState(null);
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api
      .stats()
      .then(({ stats }) => setQuota(stats.quota))
      .catch(() => {});
    // Only live / upcoming events are offered for issuing.
    api
      .events({ live: 1 })
      .then(({ events }) => {
        setEvents(events || []);
        // If exactly one event is running, jump straight to the form for it.
        if (events?.length === 1) {
          setForm((f) => ({ ...f, event_id: events[0].id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const selectedEvent = events.find((e) => e.id === form.event_id) || null;
  const multiple = events.length > 1;

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

  // Fetch the pass types (categories) available for the selected event, so the
  // devotee picks from the event's real types instead of a static list. The main
  // system may restrict which categories are visible per event via
  // devoteeAppCategories. When only one category is available (Invitee), the
  // dropdown is hidden and the category is auto-selected.
  useEffect(() => {
    if (!form.event_id) {
      setCategories([]);
      return;
    }
    const ev = events.find((e) => e.id === form.event_id);
    if (!ev?.event_code) {
      setCategories([]);
      return;
    }
    let cancelled = false;
    api
      .categories(ev.event_code)
      .then(({ categories }) => {
        if (cancelled) return;
        setCategories(categories || []);
        setForm((f) => {
          const list = categories || [];
          if (list.length === 0) return f;
          // If only one category is available, auto-select it.
          if (list.length === 1) {
            return { ...f, pass_type: list[0].name };
          }
          // Multiple categories: auto-select Invitee if present and no pick yet.
          if (!f.pass_type) {
            const invitee = list.find(
              (c) => /invitee/i.test(c.name || '') || (c.catCode || '').toUpperCase() === 'INV'
            );
            const general = list.find(
              (c) => /general/i.test(c.name || '') || (c.catCode || '').toUpperCase() === 'GN'
            );
            const pick = invitee || general || list[0];
            return pick ? { ...f, pass_type: pick.name } : f;
          }
          return f;
        });
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.event_id, events]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const selectedCat = categories.find((c) => c.name === form.pass_type);
      const { pass } = await api.createPass({
        donor_name: form.donor_name,
        phone: form.phone,
        email: form.email,
        pass_type: form.pass_type,
        category: selectedCat?.catCode || '',
        event_id: form.event_id || null,
        venue: selectedVenue || '',
        // Pass-card links must point at the public site, not the API host.
        baseUrl: siteOrigin(),
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

  if (!loaded) return <div className="loading">Loading…</div>;

  // No live events — nothing to issue against.
  if (events.length === 0) {
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
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <CalendarIcon size={40} style={{ opacity: 0.35, marginBottom: 10 }} />
          <h2 style={{ margin: '0 0 6px' }}>No live events right now</h2>
          <p className="muted" style={{ margin: 0 }}>
            Passes can be issued only for live or upcoming events. Check back when a festival is scheduled.
          </p>
        </div>
      </div>
    );
  }

  // Multiple live events — the devotee picks the event before any form shows.
  if (multiple && !form.event_id && !created) {
    return (
      <div className="fade-up">
        <header className="page-header">
          <div className="page-title">
            <span className="title-icon"><CalendarIcon size={22} /></span>
            <div>
              <h1>Select an event</h1>
              <p>Choose which event this pass is for</p>
            </div>
          </div>
        </header>
        <div className="ep-grid" style={{ display: 'grid', gap: 10 }}>
          {events.map((ev) => (
            <button
              key={ev.id}
              className="ep-chip event-pick"
              onClick={() => {
                setCreated(null);
                setForm((f) => ({ ...f, event_id: ev.id, pass_type: '' }));
              }}
              style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '16px' }}
            >
              <span>
                <span className="ep-name" style={{ fontSize: '1rem', fontWeight: 600 }}>{ev.name}</span>
                {ev.location && <span className="ep-type" style={{ display: 'block', opacity: 0.7, fontSize: '0.8rem' }}>{ev.location}</span>}
              </span>
              <span className="badge" style={{ flexShrink: 0 }}>{ev.status || 'live'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pct = quota && quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;

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

      {multiple && selectedEvent && (
        <div className="alert" style={{ margin: '0 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>
            <b>Event:</b> {selectedEvent.name}
            {selectedEvent.location ? ` · ${selectedEvent.location}` : ''}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setForm((f) => ({ ...f, event_id: '', pass_type: '' }))}
          >
            Change
          </button>
        </div>
      )}

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
              {categories.length > 1 ? (
                <label>
                  Pass type
                  <select value={form.pass_type} onChange={set('pass_type')}>
                    {categories.map((c) => {
                      const hasLimit = c.limit != null;
                      const exhausted = hasLimit && c.remaining !== null && c.remaining <= 0;
                      const label = c.catCode ? `${c.name} (${c.catCode})` : c.name;
                      const suffix = hasLimit
                        ? c.remaining != null && c.remaining <= 0
                          ? ' — Full'
                          : ` — ${c.remaining} left`
                        : '';
                      return (
                        <option key={c.name} value={c.name} disabled={exhausted}>
                          {label}{suffix}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : categories.length === 1 ? (
                <label>
                  Pass type
                  <input value={categories[0].catCode ? `${categories[0].name} (${categories[0].catCode})` : categories[0].name} disabled style={{ opacity: 0.7 }} />
                </label>
              ) : (
                <label>
                  Pass type
                  <select value={form.pass_type} onChange={set('pass_type')}>
                    {PASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              )}
            </div>

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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => shareWhatsApp(created.id, created.phone, created.donor_name, created.token, created.qr_image)}
                  >
                    <WhatsAppIcon size={15} /> WhatsApp
                  </button>
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
