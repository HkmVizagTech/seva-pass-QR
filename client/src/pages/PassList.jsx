import React, { useEffect, useState } from 'react';
import { api, downloadQrPng, shareWhatsApp, formatDateTime } from '../api.js';
import {
  ListIcon,
  DownloadIcon,
  EyeIcon,
  WhatsAppIcon,
  CloseIcon,
} from '../components/icons.jsx';

const STATUS = ['', 'unused', 'used', 'revoked'];

function displayStatus(pass) {
  const raw = pass.live_status || pass.status || 'unused';
  if (raw === 'active') return 'unused';
  if (['used', 'revoked'].includes(raw)) return raw;
  return 'unused';
}

// ─── Scan badges (compact horizontal pills) ─────────────────────────────────
function ScanBadges({ history, className }) {
  if (!history || history.length === 0) return <span className="sub" style={{ fontSize: '0.78rem' }}>—</span>;
  return (
    <div className={className || 'pass-scan-badges'}>
      {history.filter((r) => r.result === 'granted').map((r, i) => (
        <span key={i} className="pass-scan-badge">✅ {r.stationLabel || 'Station'}</span>
      ))}
      {history.filter((r) => r.result !== 'granted').map((r, i) => (
        <span key={`d-${i}`} className="pass-scan-badge denied">❌ {r.stationLabel || 'Station'}</span>
      ))}
    </div>
  );
}

// ─── Pass Detail Modal ──────────────────────────────────────────────────────
function PassDetailModal({ passId, onClose }) {
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!passId) return;
    setLoading(true);
    setError('');
    api
      .getPass(passId)
      .then(({ pass }) => setPass(pass))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [passId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this pass? The devotee will no longer be able to use it.')) return;
    setRevoking(true);
    try {
      await api.revoke(passId);
      const { pass: updated } = await api.getPass(passId);
      setPass(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="qr-modal-backdrop" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="qr-modal-close" onClick={onClose}><CloseIcon size={14} /></button>
        <b style={{ fontSize: '1rem', display: 'block', marginBottom: 14, paddingRight: 32 }}>Pass Details</b>

        {loading ? (
          <div className="loading">Loading…</div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : pass ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Status */}
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem',
              background: displayStatus(pass) === 'used' ? 'var(--green-bg)' : displayStatus(pass) === 'revoked' ? 'var(--red-bg)' : 'var(--cream)',
              color: displayStatus(pass) === 'used' ? 'var(--green)' : displayStatus(pass) === 'revoked' ? 'var(--red)' : 'var(--text)',
              display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {displayStatus(pass) === 'used' ? '✅' : displayStatus(pass) === 'revoked' ? '🚫' : '🎫'}
                {pass.live_status || pass.status}
                {pass.live_status && pass.live_status !== pass.status && (
                  <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.7 }}>(live)</span>
                )}
              </span>
              {displayStatus(pass) === 'unused' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)', fontSize: '0.8rem', padding: '2px 8px' }}
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
              <div><span className="sub">Name</span><br /><b>{pass.donor_name}</b></div>
              <div><span className="sub">Phone</span><br />{pass.phone || '—'}</div>
              <div><span className="sub">Email</span><br />{pass.email || '—'}</div>
              <div><span className="sub">Type</span><br />{pass.pass_type}</div>
              <div><span className="sub">Event</span><br />{pass.event_name || '—'}</div>
              <div><span className="sub">Source</span><br />{pass.source}</div>
              <div><span className="sub">Issued by</span><br />{pass.issuer_name || '—'}</div>
              <div><span className="sub">Issued on</span><br />{pass.created_at ? formatDateTime(pass.created_at) : '—'}</div>
              {pass.qr_token && <div style={{ gridColumn: '1 / -1' }}><span className="sub">QR ID</span><br /><span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{pass.qr_token}</span></div>}
            </div>

            {/* Delivery */}
            {pass.delivery_status && pass.delivery_status !== 'pending' && (
              <div style={{ fontSize: '0.85rem' }}>
                <span className="sub">Delivery</span>{' '}
                <span className={`badge ${pass.delivery_status === 'sent' || pass.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>
                  {pass.delivery_status}
                </span>
              </div>
            )}

            {/* Scan history */}
            {pass.redemption_history && pass.redemption_history.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>Scan History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pass.redemption_history.map((scan, i) => (
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
                          {scan.scannedBy && <span> · by {scan.scannedBy}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!pass.redemption_history || pass.redemption_history.length === 0) && (
              <div className="sub" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '8px 0' }}>
                No scans recorded yet
              </div>
            )}

            {/* QR preview */}
            {(pass.qr_image || pass.qr_svg) && (
              <div style={{ textAlign: 'center' }}>
                <img src={pass.qr_image || pass.qr_svg} alt="QR" style={{ maxWidth: 180, borderRadius: 10 }} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="qr-modal-backdrop" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="qr-modal-close" onClick={onClose}><CloseIcon size={14} /></button>
        <b style={{ display: 'block', marginBottom: 12, paddingRight: 32 }}>Scan History — {holder.name}</b>

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

// ─── Station Status Badge (table variant) ───────────────────────────────────
function StationStatus({ redemptionHistory }) {
  if (!redemptionHistory || redemptionHistory.length === 0) {
    return <span style={{ opacity: 0.45, fontSize: '0.78rem' }}>No scans</span>;
  }
  return (
    <div className="pass-scan-badges">
      {redemptionHistory.filter((r) => r.result === 'granted').map((r, i) => (
        <span key={i} className="pass-scan-badge">✅ {r.stationLabel || 'Station'}</span>
      ))}
      {redemptionHistory.filter((r) => r.result !== 'granted').map((r, i) => (
        <span key={`f-${i}`} className="pass-scan-badge denied">❌ {r.stationLabel || 'Station'}</span>
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
  const [qrModal, setQrModal] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [scanModal, setScanModal] = useState(null);

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
        setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [q, category, bahumana, eventId, page]);

  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [q, category, bahumana, eventId]);

  const openQr = async (holder) => {
    const qrId = holder.qrPass?.qrId;
    if (!qrId) return;
    setQrModal({ qrId, name: holder.name });
    setQrUrl('');
    try {
      setQrUrl(await api.holderQrImage(qrId));
    } catch {
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
        <input className="input" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input" placeholder="Category (e.g. INV, SP, DN, VIP)…" value={category} onChange={(e) => setCategory(e.target.value)} />
        <select className="input" value={bahumana} onChange={(e) => setBahumana(e.target.value)}>
          <option value="">Bahumana: all</option>
          <option value="yes">Bahumana received</option>
          <option value="no">Not received</option>
        </select>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : holders.length === 0 ? (
        <div className="alert alert-info" style={{ margin: 0 }}>No devotees match your filters. Passes you issue will appear here.</div>
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
                    <td>{h.name}<div className="sub">{h.phone}</div></td>
                    <td>{h.catId?.name || '—'}{h.catId?.catCode ? ` (${h.catId.catCode})` : ''}</td>
                    <td>{h.eventId?.name || '—'}</td>
                    <td><span className={`badge badge-${h.qrPass?.status || 'none'}`}>{h.qrPass?.status || 'no pass'}</span></td>
                    <td><StationStatus redemptionHistory={h.qrPass?.redemptionHistory} /></td>
                    <td>{bahumanaLabel(h)}</td>
                    <td className="ta-r">
                      <div className="actions">
                        {h.qrPass?.qrId && <button className="btn btn-ghost btn-sm" onClick={() => openQr(h)}><EyeIcon size={14} /> QR</button>}
                        {h._id && <button className="btn btn-ghost btn-sm" onClick={() => setScanModal(h)}>📋 History</button>}
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
                  <div><b>Bahumana</b>{bahumanaLabel(h)}</div>
                </div>
                <ScanBadges history={h.qrPass?.redemptionHistory} />
                <div className="pass-item-actions">
                  {h.qrPass?.qrId && <button className="btn btn-ghost btn-sm" onClick={() => openQr(h)}><EyeIcon size={14} /> View QR</button>}
                  {h._id && <button className="btn btn-ghost btn-sm" onClick={() => setScanModal(h)}>📋 History</button>}
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span style={{ alignSelf: 'center', fontSize: '0.85rem' }}>Page {pagination.page} / {pagination.pages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* QR modal */}
      {qrModal && (
        <div className="qr-modal-backdrop" onClick={() => { setQrModal(null); setQrUrl(''); }}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="qr-modal-close" onClick={() => { setQrModal(null); setQrUrl(''); }}><CloseIcon size={14} /></button>
            <b style={{ display: 'block', marginBottom: 12, paddingRight: 32 }}>{qrModal.name}</b>
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

      {scanModal && <ScanHistoryModal holder={scanModal} onClose={() => setScanModal(null)} />}
    </div>
  );
}

// ─── Admin / devotee view: all passes ──────────────────────────────────────
function AllPasses({ role }) {
  const [passes, setPasses] = useState([]);
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const [detailPass, setDetailPass] = useState(null);

  useEffect(() => {
    api.events().then(({ events }) => setEvents(events)).catch(() => {});
  }, []);

  const load = () => {
    setError('');
    api
      .passes({ q, status, event_id: eventId })
      .then(({ passes }) => setPasses(passes))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [q, status, eventId]);

  const pngName = (p) => `${p.donor_name.replace(/\s+/g, '-')}-pass.png`;

  return (
    <div className="fade-up">
      <header className="page-header">
        <div className="page-title">
          <span className="title-icon"><ListIcon size={22} /></span>
          <div>
            <h1>{role !== 'admin' ? 'My Passes' : 'All Passes'}</h1>
            <p>{passes.length} pass(es) shown</p>
          </div>
        </div>
      </header>

      <div className="filters">
        <input className="input" placeholder="Search name, phone, email or token…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => <option key={s} value={s}>{s === '' ? 'All statuses' : s}</option>)}
        </select>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
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
                  <th>Scans</th>
                  <th>Delivered</th>
                  <th>Issued by</th>
                  <th className="ta-r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailPass(p.id)}>
                    <td>
                      {p.donor_name}
                      <div className="sub">
                        {p.phone || p.email || ''}
                        {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                      </div>
                    </td>
                    <td>{p.pass_type}</td>
                    <td>{p.event_name || '—'}</td>
                    <td><span className={`badge badge-${displayStatus(p)}`}>{displayStatus(p)}</span></td>
                    <td><StationStatus redemptionHistory={p.redemption_history} /></td>
                    <td>
                      {p.delivery_status && p.delivery_status !== 'pending' ? (
                        <span className={`badge ${p.delivery_status === 'sent' || p.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>{p.delivery_status}</span>
                      ) : <span className="sub">—</span>}
                    </td>
                    <td>{p.issuer_name || '—'}</td>
                    <td className="ta-r">
                      <div className="actions" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetailPass(p.id)}><EyeIcon size={14} /> Details</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadQrPng(p.id, pngName(p))}><DownloadIcon size={14} /> PNG</button>
                        {p.phone && <button className="btn btn-ghost btn-sm" onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image, p.event_name)}><WhatsAppIcon size={14} /></button>}
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
              <div key={p.id} className="pass-item fade-up" style={{ cursor: 'pointer' }} onClick={() => setDetailPass(p.id)}>
                <div className="pass-item-head">
                  <div>
                    <div className="pass-item-name">{p.donor_name}</div>
                    <div className="pass-item-sub">
                      {p.phone || p.email || ''}
                      {p.source === 'main-system' && <span className="badge badge-main">main system</span>}
                    </div>
                  </div>
                  <span className={`badge badge-${displayStatus(p)}`}>{displayStatus(p)}</span>
                </div>

                <div className="pass-item-meta">
                  <div><b>Type</b>{p.pass_type}</div>
                  <div><b>Event</b>{p.event_name || '—'}</div>
                  <div><b>Delivered</b>
                    {p.delivery_status && p.delivery_status !== 'pending' ? (
                      <span className={`badge ${p.delivery_status === 'sent' || p.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>{p.delivery_status}</span>
                    ) : '—'}
                  </div>
                  <div><b>Issued by</b>{p.issuer_name || '—'}</div>
                </div>

                <ScanBadges history={p.redemption_history} />

                <div className="pass-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetailPass(p.id)}><EyeIcon size={14} /> Details</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadQrPng(p.id, pngName(p))}><DownloadIcon size={14} /> PNG</button>
                  {p.phone && <button className="btn btn-ghost btn-sm" onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image, p.event_name)}><WhatsAppIcon size={14} /> WA</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detailPass && <PassDetailModal passId={detailPass} onClose={() => setDetailPass(null)} />}
    </div>
  );
}

export default function PassList() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    api.me().then(({ user }) => setRole(user.role)).catch(() => setRole('admin'));
  }, []);

  if (role === null) return <div className="loading">Loading…</div>;

  return role === 'devotee' ? <MyPasses /> : <AllPasses role={role} />;
}
