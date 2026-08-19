import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadQrPng, shareWhatsApp, formatDateTime } from '../api.js';
import {
  ListIcon,
  DownloadIcon,
  EyeIcon,
  TicketIcon,
  WhatsAppIcon,
  CloseIcon,
} from '../components/icons.jsx';

const STATUS = ['', 'unused', 'used', 'revoked'];

// ─── Scan History Modal ─────────────────────────────────────────────────────
function ScanHistoryModal({ holder, onClose }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!holder?._id) return;
    setLoading(true);
    api
      .holderScanHistory(holder._id)
      .then((data) => setHistory(data.history || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [holder?._id]);

  return (
    <div className="qr-modal-backdrop" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} tabIndex={-1} ref={(el) => { if (el) el.focus(); }}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b>Scan History — {holder.name}</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><CloseIcon size={15} /></button>
        </div>

        {loading ? (
          <div className="loading">Loading…</div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : !history || history.length === 0 ? (
          <p className="muted">No scans recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((scan, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                background: scan.result === 'granted' ? 'var(--green-bg)' : 'var(--red-bg)',
                borderRadius: 10, fontSize: '0.85rem',
              }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                  {scan.result === 'granted' ? '✅' : '❌'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {scan.epId?.name || scan.stationLabel || 'Station'}
                    <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>
                      ({scan.result})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                    {scan.scannedAt ? formatDateTime(scan.scannedAt) : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Station Status Badge ───────────────────────────────────────────────────
function StationStatus({ redemptionHistory }) {
  if (!redemptionHistory || redemptionHistory.length === 0) {
    return <span style={{ opacity: 0.45, fontSize: '0.78rem' }}>No scans</span>;
  }
  const granted = redemptionHistory.filter((r) => r.result === 'granted');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {granted.map((r, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
          background: 'var(--green-bg)', color: 'var(--green)',
        }}>
          ✅ {r.stationLabel || 'Station'}
        </span>
      ))}
      {redemptionHistory.filter((r) => r.result !== 'granted').map((r, i) => (
        <span key={`f-${i}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 500,
          background: 'var(--red-bg)', color: 'var(--red)', opacity: 0.7,
        }}>
          ❌ {r.stationLabel || 'Station'}
        </span>
      ))}
    </div>
  );
}

// ─── Preacher view: their own holders from the main system ───────────────────
function MyPasses() {
  const [holders, setHolders] = useState([]);
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [bahumana, setBahumana] = useState('');
  const [eventId, setEventId] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null); // { qrId, name }
  const [qrUrl, setQrUrl] = useState('');
  const [scanModal, setScanModal] = useState(null); // holder object

  useEffect(() => {
    api
      .events({ live: 1 })
      .then(({ events }) => setEvents(events || []))
      .catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError('');
    api
      .myHolders({ q, category, bahumana, eventId, page, limit: 20 })
      .then((data) => {
        setHolders(data.holders || []);
        setPagination(
          data.pagination || { total: 0, page: 1, pages: 1 }
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [q, category, bahumana, eventId, page]);

  useEffect(() => {
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, bahumana, eventId]);

  const openQr = async (holder) => {
    const qrId = holder.qrPass?.qrId;
    if (!qrId) return;
    setQrModal({ qrId, name: holder.name });
    setQrUrl('');
    try {
      setQrUrl(await api.holderQrImage(qrId));
    } catch (e) {
      setQrUrl('error');
    }
  };

  const bahumanaLabel = (h) => {
    if (h.bahumanaReceived) {
      return (
        <span style={{ color: 'var(--green, #1a7f37)', fontWeight: 600 }}>✅ Received{h.bahumanaAt ? ` · ${formatDateTime(h.bahumanaAt)}` : ''}</span>
      );
    }
    return <span style={{ opacity: 0.65 }}>—</span>;
  };

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><ListIcon size={22} /></span>
          <div>
            <h1>My Passes</h1>
            <p>{pagination.total} devotee(s) under you{pagination.total ? ` · page ${pagination.page}/${pagination.pages}` : ''}</p>
          </div>
        </div>
      </header>

      <div className="filters">
        <input
          className="input"
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="input"
          placeholder="Category (e.g. INV, SP, DN, VIP)…"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <select className="input" value={bahumana} onChange={(e) => setBahumana(e.target.value)}>
          <option value="">Bahumana: all</option>
          <option value="yes">Bahumana received</option>
          <option value="no">Not received</option>
        </select>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : holders.length === 0 ? (
        <div className="alert alert-info" style={{ margin: 0 }}>
          No devotees match your filters. Passes you issue will appear here.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-wrap pass-card-row">
            <table className="table">
              <thead>
                <tr>
                  <th>Devotee</th>
                  <th>Category</th>
                  <th>Event</th>
                  <th>Pass</th>
                  <th>Scan Status</th>
                  <th>Bahumana</th>
                  <th className="ta-r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((h) => (
                  <tr key={h._id}>
                    <td>
                      {h.name}
                      <div className="sub">{h.phone}</div>
                    </td>
                    <td>{h.catId?.name || '—'}{h.catId?.catCode ? ` (${h.catId.catCode})` : ''}</td>
                    <td>{h.eventId?.name || '—'}</td>
                    <td>
                      <span className={`badge badge-${h.qrPass?.status || 'none'}`}>{h.qrPass?.status || 'no pass'}</span>
                    </td>
                    <td>
                      <StationStatus redemptionHistory={h.qrPass?.redemptionHistory} />
                    </td>
                    <td>{bahumanaLabel(h)}</td>
                    <td className="ta-r">
                      <div className="actions">
                        {h.qrPass?.qrId && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openQr(h)}>
                            <EyeIcon size={14} /> QR
                          </button>
                        )}
                        {h._id && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setScanModal(h)}>
                            📋 History
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="pass-list-cards">
            {holders.map((h) => (
              <div key={h._id} className="pass-item fade-up">
                <div className="pass-item-head">
                  <div>
                    <div className="pass-item-name">{h.name}</div>
                    <div className="pass-item-sub">{h.phone}</div>
                  </div>
                  <span className={`badge badge-${h.qrPass?.status || 'none'}`}>{h.qrPass?.status || 'no pass'}</span>
                </div>
                <div className="pass-item-meta">
                  <div><b>Category</b>{h.catId?.name || '—'}{h.catId?.catCode ? ` (${h.catId.catCode})` : ''}</div>
                  <div><b>Event</b>{h.eventId?.name || '—'}</div>
                  <div><b>Scans</b><StationStatus redemptionHistory={h.qrPass?.redemptionHistory} /></div>
                  <div><b>Bahumana</b>{bahumanaLabel(h)}</div>
                </div>
                <div className="pass-item-actions">
                  {h.qrPass?.qrId && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openQr(h)}>
                      <EyeIcon size={14} /> View QR
                    </button>
                  )}
                  {h._id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setScanModal(h)}>
                      📋 History
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span style={{ alignSelf: 'center', fontSize: '0.85rem' }}>Page {pagination.page} / {pagination.pages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* QR modal */}
      {qrModal && (
        <div className="qr-modal-backdrop" onClick={() => { setQrModal(null); setQrUrl(''); }} onKeyDown={(e) => { if (e.key === 'Escape') { setQrModal(null); setQrUrl(''); } }} tabIndex={-1} ref={(el) => { if (el) el.focus(); }}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <b>{qrModal.name}</b>
              <button className="btn btn-ghost btn-sm" onClick={() => { setQrModal(null); setQrUrl(''); }}>
                <CloseIcon size={15} />
              </button>
            </div>
            {qrUrl === 'error' ? (
              <p className="muted">Could not load the QR image.</p>
            ) : qrUrl ? (
              <img src={qrUrl} alt={`QR for ${qrModal.name}`} style={{ width: '100%', maxWidth: 320, borderRadius: 12, display: 'block', margin: '0 auto' }} />
            ) : (
              <div className="loading">Loading…</div>
            )}
          </div>
        </div>
      )}

      {/* Scan history modal */}
      {scanModal && (
        <ScanHistoryModal holder={scanModal} onClose={() => setScanModal(null)} />
      )}
    </div>
  );
}

// ─── Admin view: all passes (unchanged behaviour) ────────────────────────────
function AllPasses() {
  const [passes, setPasses] = useState([]);
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api
      .events()
      .then(({ events }) => setEvents(events))
      .catch(() => {});
  }, []);

  const load = () => {
    setError('');
    api
      .passes({ q, status, event_id: eventId })
      .then(({ passes }) => setPasses(passes))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [q, status, eventId]);

  const revoke = async (id) => {
    if (!window.confirm('Revoke this pass? It can no longer be used.')) return;
    setBusyId(id);
    try {
      await api.revoke(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const pngName = (p) => `${p.donor_name.replace(/\s+/g, '-')}-pass.png`;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><ListIcon size={22} /></span>
          <div>
            <h1>All Passes</h1>
            <p>{passes.length} pass(es) shown</p>
          </div>
        </div>
      </header>

      <div className="filters">
        <input
          className="input"
          placeholder="Search name, phone, email or token…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All statuses' : s}</option>
          ))}
        </select>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {passes.length === 0 ? (
        <div className="alert alert-info" style={{ margin: 0 }}>No passes match your filters.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-wrap pass-card-row">
            <table className="table">
              <thead>
                <tr>
                  <th>Donor / Invitee</th>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Delivered</th>
                  <th>Issued by</th>
                  <th className="ta-r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.donor_name}
                      <div className="sub">
                        {p.phone || p.email || ''}
                        {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                      </div>
                    </td>
                    <td>{p.pass_type}</td>
                    <td>{p.event_name || '—'}</td>
                    <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                    <td>
                      {p.delivery_status && p.delivery_status !== 'pending' ? (
                        <span className={`badge ${p.delivery_status === 'sent' || p.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>
                          {p.delivery_status}
                        </span>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td>{p.issuer_name || '—'}</td>
                    <td className="ta-r">
                      <div className="actions">
                        <Link className="btn btn-ghost btn-sm" to={`/pass?t=${p.token}`}>
                          <EyeIcon size={14} /> Card
                        </Link>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => downloadQrPng(p.id, pngName(p))}
                        >
                          <DownloadIcon size={14} /> PNG
                        </button>
                        {p.status !== 'revoked' && (
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busyId === p.id}
                            onClick={() => revoke(p.id)}
                          >
                            Revoke
                          </button>
                        )}
                        {p.phone && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image)}
                          >
                            <WhatsAppIcon size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="pass-list-cards">
            {passes.map((p) => (
              <div key={p.id} className="pass-item fade-up">
                <div className="pass-item-head">
                  <div>
                    <div className="pass-item-name">{p.donor_name}</div>
                    <div className="pass-item-sub">
                      {p.phone || p.email || ''}
                      {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                    </div>
                  </div>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </div>

                <div className="pass-item-meta">
                  <div><b>Type</b>{p.pass_type}</div>
                  <div><b>Event</b>{p.event_name || '—'}</div>
                  <div><b>Delivered</b>
                    {p.delivery_status && p.delivery_status !== 'pending' ? (
                      <span className={`badge ${p.delivery_status === 'sent' || p.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>
                        {p.delivery_status}
                      </span>
                    ) : '—'}
                  </div>
                  <div><b>Issued by</b>{p.issuer_name || '—'}</div>
                </div>

                <div className="pass-item-actions">
                  <Link className="btn btn-ghost btn-sm" to={`/pass?t=${p.token}`}>
                    <TicketIcon size={14} /> Card
                  </Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadQrPng(p.id, pngName(p))}>
                    <DownloadIcon size={14} /> PNG
                  </button>
                  {p.status !== 'revoked' && (
                    <button className="btn btn-danger btn-sm" disabled={busyId === p.id} onClick={() => revoke(p.id)}>
                      Revoke
                    </button>
                  )}
                  {p.phone && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image)}
                    >
                      <WhatsAppIcon size={14} /> WA
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PassList() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setRole(user.role))
      .catch(() => setRole('admin'));
  }, []);

  if (role === null) return <div className="loading">Loading…</div>;

  return role === 'preacher' ? <MyPasses /> : <AllPasses />;
}
