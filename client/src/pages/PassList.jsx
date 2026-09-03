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

// ─── Shared modal shell ─────────────────────────────────────────────────────
// Fixed header + single scrolling body + pinned footer, so long content never
// pushes the close button or the actions out of view.
function Modal({ eyebrow, title, footer, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div className="qr-modal-backdrop" onClick={onClose}>
      <div className="qr-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="qr-modal-header">
          {eyebrow && <span className="qr-modal-eyebrow">{eyebrow}</span>}
          <span className="qr-modal-title">{title}</span>
          <button className="qr-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="qr-modal-body">{children}</div>
        {footer && <div className="qr-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// A label / value row inside a modal
function DetailRow({ label, value, mono }) {
  return (
    <div className="pass-detail-row">
      <span className="k">{label}</span>
      <span className={mono ? 'v mono' : 'v'}>{value}</span>
    </div>
  );
}

// One scan entry (shared by both history views)
function ScanRow({ scan }) {
  const granted = scan.result === 'granted';
  return (
    <div className={granted ? 'scan-row' : 'scan-row denied'}>
      <span className="icon">{granted ? '✅' : '❌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="who">
          {scan.epId?.name || scan.stationLabel || 'Station'}
          <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>({scan.result})</span>
        </div>
        <div className="when">
          {scan.scannedAt ? formatDateTime(scan.scannedAt) : '—'}
          {scan.scannedBy && <span> · by {scan.scannedBy}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Pass Detail Modal ──────────────────────────────────────────────────────
function PassDetailModal({ passId, onClose }) {
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [retrying, setRetrying] = useState(false);

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

  const handleRetryDelivery = async () => {
    setRetrying(true);
    setError('');
    try {
      const { pass: updated } = await api.retryDelivery(passId);
      setPass(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setRetrying(false);
    }
  };

  const st = pass ? displayStatus(pass) : '';
  const footer = pass ? (
    <>
      {(pass.qr_image || pass.qr_svg) && (
        <button className="btn btn-ghost btn-sm" onClick={() => downloadQrPng(pass.id || passId, `${(pass.donor_name || 'pass').replace(/\s+/g, '-')}-pass.png`)}>
          <DownloadIcon size={14} /> Download PNG
        </button>
      )}
      {st === 'unused' && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--red)' }}
          onClick={handleRevoke}
          disabled={revoking}
        >
          {revoking ? 'Revoking…' : 'Revoke pass'}
        </button>
      )}
    </>
  ) : null;

  return (
    <Modal
      eyebrow="Pass details"
      title={pass ? pass.donor_name : 'Pass'}
      footer={footer}
      onClose={onClose}
    >
      {loading ? (
        <div className="loading">Loading…</div>
      ) : error ? (
        <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>
      ) : pass ? (
        <>
          {/* Status */}
          <div className={`pass-status-strip${st === 'used' ? ' is-used' : st === 'revoked' ? ' is-revoked' : ''}`}>
            <span className="label">
              {st === 'used' ? '✅' : st === 'revoked' ? '🚫' : '🎫'}
              {pass.live_status || pass.status}
            </span>
            {pass.live_status && pass.live_status !== pass.status && (
              <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.7 }}>live</span>
            )}
          </div>

          {/* QR first — it is what people open this card for */}
          {(pass.qr_image || pass.qr_svg) && (
            <div className="qr-frame">
              <img src={pass.qr_image || pass.qr_svg} alt={`QR for ${pass.donor_name}`} />
              <span className="qr-frame-caption">Show this at the entry gate</span>
            </div>
          )}

          {/* Info */}
          <div className="pass-detail-list">
            <DetailRow label="Name" value={pass.donor_name} />
            <DetailRow label="Phone" value={pass.phone || '—'} />
            {pass.email && <DetailRow label="Email" value={pass.email} />}
            <DetailRow label="Type" value={pass.pass_type} />
            <DetailRow label="Event" value={pass.event_name || '—'} />
            <DetailRow label="Source" value={pass.source} />
            <DetailRow label="Issued by" value={pass.issuer_name || '—'} />
            <DetailRow label="Issued on" value={pass.created_at ? formatDateTime(pass.created_at) : '—'} />
            {pass.qr_token && <DetailRow label="QR ID" value={pass.qr_token} mono />}
          </div>

          {/* Delivery */}
          {((pass.delivery_status && pass.delivery_status !== 'pending') || pass.community_app_sync) && (
            <div className="pass-detail-list">
              {pass.delivery_status && pass.delivery_status !== 'pending' && (
                <>
                  <DetailRow
                    label="Delivery"
                    value={
                      <span className={`badge ${pass.delivery_status === 'sent' || pass.delivery_status === 'delivered' ? 'badge-used' : 'badge-revoked'}`}>
                        {pass.delivery_status}
                      </span>
                    }
                  />
                  {pass.delivery_status === 'failed' && (
                    <div className="pass-detail-row" style={{ display: 'block' }}>
                      {pass.delivery_error && (
                        <div style={{ color: 'var(--red)', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                          {pass.delivery_error}
                        </div>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8, color: 'var(--green)' }}
                        onClick={handleRetryDelivery}
                        disabled={retrying}
                      >
                        {retrying ? 'Retrying…' : '↻ Retry delivery'}
                      </button>
                    </div>
                  )}
                </>
              )}
              {pass.community_app_sync && (
                <>
                  <DetailRow
                    label="Vaikuntham app"
                    value={
                      <span className={`badge ${pass.community_app_sync.startsWith('sent') ? 'badge-used' : 'badge-revoked'}`}>
                        {pass.community_app_sync.split(':')[0]}
                      </span>
                    }
                  />
                  {pass.community_app_sync.startsWith('failed') && (
                    <div className="pass-detail-row" style={{ display: 'block', color: 'var(--red)', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                      {pass.community_app_sync.split(':').slice(1).join(':')}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Scan history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="qr-modal-section-title">Scan history</span>
            {pass.redemption_history && pass.redemption_history.length > 0 ? (
              pass.redemption_history.map((scan, i) => <ScanRow key={i} scan={scan} />)
            ) : (
              <div className="qr-modal-empty">No scans recorded yet</div>
            )}
          </div>
        </>
      ) : null}
    </Modal>
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

  return (
    <Modal eyebrow="Scan history" title={holder.name} onClose={onClose}>
      {loading ? (
        <div className="loading">Loading…</div>
      ) : error ? (
        <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>
      ) : !history || history.length === 0 ? (
        <div className="qr-modal-empty">No scans recorded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.map((scan, i) => <ScanRow key={i} scan={scan} />)}
        </div>
      )}
    </Modal>
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

// ─── View Pass — compact popup with holder details + QR ────────────────────
// Shows everything about a pass right over the list, no full-page navigation.
function PassViewModal({ holder, qrUrl, onClose, onScan }) {
  const catName = holder.catId?.name
    ? `${holder.catId.name}${holder.catId.catCode ? ` (${holder.catId.catCode})` : ''}`
    : '—';
  const status = holder.qrPass?.status || 'no pass';

  const details = [
    ['Phone', holder.phone || '—'],
    ['Category', catName],
    ['Tier', holder.subCategory ? `Tier ${holder.subCategory}` : '—'],
    ['Event', holder.eventId?.name || '—'],
  ];

  return (
    <Modal
      eyebrow="Pass"
      title={holder.name}
      onClose={onClose}
      footer={holder._id ? <button className="btn btn-ghost btn-sm" onClick={onScan}>📋 Scan history</button> : null}
    >
      <div className={`pass-status-strip${status === 'used' ? ' is-used' : status === 'revoked' ? ' is-revoked' : ''}`}>
        <span className="label">
          {status === 'used' ? '✅' : status === 'revoked' ? '🚫' : '🎫'}
          {status}
        </span>
      </div>

      {/* QR — the reason this card gets opened, so it leads */}
      <div className="qr-frame">
        {qrUrl === 'error' ? (
          <p className="qr-frame-caption" style={{ color: 'var(--red)', margin: 0 }}>Could not load the QR image.</p>
        ) : qrUrl === 'none' ? (
          <p className="qr-frame-caption" style={{ margin: 0 }}>No QR associated with this pass.</p>
        ) : qrUrl ? (
          <>
            <img src={qrUrl} alt={`QR for ${holder.name}`} />
            <span className="qr-frame-caption">Show this at the entry gate</span>
          </>
        ) : (
          <div className="loading">Loading QR…</div>
        )}
      </div>

      <div className="pass-detail-list">
        {details.map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
      </div>
    </Modal>
  );
}


// ─── Preacher view: their own holders from the main system ───────────────────
function MyPasses() {
  const [holders, setHolders] = useState([]);
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [bahumana, setBahumana] = useState('');
  const [eventCode, setEventCode] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [scanModal, setScanModal] = useState(null);
  const [exporting, setExporting] = useState(false);

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
      .myHolders({ q, category, subCategory, bahumana, eventCode, page, limit: 20 })
      .then((data) => {
        setHolders(data.holders || []);
        setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Export all holders matching the current filters to CSV (loops through
  // every page so the whole result set is included, not just the visible page).
  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const all = [];
      let pg = 1;
      let total = 0;
      do {
        // eslint-disable-next-line no-await-in-loop
        const data = await api.myHolders({ q, category, subCategory, bahumana, eventCode, page: pg, limit: 100 });
        all.push(...(data.holders || []));
        total = data.pagination?.total || all.length;
        if (data.pagination?.pages === undefined || pg >= (data.pagination.pages || pg)) break;
        pg += 1;
      } while (all.length < total && pg <= 200);

      const rows = [];
      const head = ['Name', 'Phone', 'Category', 'Tier', 'Event', 'Status', 'Bahumana'];
      const esc = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      rows.push(head.join(','));
      for (const h of all) {
        rows.push([
          esc(h.name),
          esc(h.phone),
          esc(h.catId?.name || ''),
          esc(h.subCategory || ''),
          esc(h.eventId?.name || ''),
          esc(h.qrPass?.status || ''),
          h.bahumanaReceived ? 'Received' : '',
        ].join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-passes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(load, [q, category, subCategory, bahumana, eventCode, page]);

  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [q, category, subCategory, bahumana, eventCode]);

  const openPass = async (holder) => {
    const qrId = holder.qrPass?.qrId;
    setQrModal({ holder });
    setQrUrl('');
    if (!qrId) { setQrUrl('none'); return; }
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
        <div className="page-title" style={{ flex: 1 }}>
          <span className="title-icon"><ListIcon size={22} /></span>
          <div>
            <h1>My Passes</h1>
            <p>{pagination.total} devotee(s) under you{pagination.total ? ` · page ${pagination.page}/${pagination.pages}` : ''}</p>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting || pagination.total === 0} title="Export filtered pass list to CSV">
          <DownloadIcon size={14} /> {exporting ? 'Exporting…' : 'Export'}
        </button>
      </header>

      <div className="filters">
        <input className="input" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input" placeholder="Category (e.g. INV, SP, DN, VIP)…" value={category} onChange={(e) => setCategory(e.target.value)} />
        <select className="input" value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
          <option value="">Tier: all</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
        </select>
        <select className="input" value={bahumana} onChange={(e) => setBahumana(e.target.value)}>
          <option value="">Bahumana: all</option>
          <option value="yes">Bahumana received</option>
          <option value="no">Not received</option>
        </select>
        <select className="input" value={eventCode} onChange={(e) => setEventCode(e.target.value)}>
          <option value="">All events</option>
          {events.map((ev) => <option key={ev.id} value={ev.event_code}>{ev.name}</option>)}
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
                    <td>{h.catId?.name || '—'}{h.catId?.catCode ? ` (${h.catId.catCode})` : ''}{h.subCategory ? ` · T${h.subCategory}` : ''}</td>
                    <td>{h.eventId?.name || '—'}</td>
                    <td><span className={`badge badge-${h.qrPass?.status || 'none'}`}>{h.qrPass?.status || 'no pass'}</span></td>
                    <td><StationStatus redemptionHistory={h.qrPass?.redemptionHistory} /></td>
                    <td>{bahumanaLabel(h)}</td>
                    <td className="ta-r">
                      <div className="actions">
                        {h.qrPass?.qrId && <button className="btn btn-ghost btn-sm" onClick={() => openPass(h)}><EyeIcon size={14} /> Pass</button>}
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
                  <div><b>Category</b>{h.catId?.name || '—'}{h.catId?.catCode ? ` (${h.catId.catCode})` : ''}{h.subCategory ? ` · T${h.subCategory}` : ''}</div>
                  <div><b>Event</b>{h.eventId?.name || '—'}</div>
                  <div><b>Bahumana</b>{bahumanaLabel(h)}</div>
                </div>
                <ScanBadges history={h.qrPass?.redemptionHistory} />
                <div className="pass-item-actions">
                  {h.qrPass?.qrId && <button className="btn btn-ghost btn-sm" onClick={() => openPass(h)}><EyeIcon size={14} /> View Pass</button>}
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

      {/* View Pass compact modal */}
      {qrModal && qrModal.holder && <PassViewModal holder={qrModal.holder} qrUrl={qrUrl} onClose={() => { setQrModal(null); setQrUrl(''); }} onScan={() => { setScanModal(qrModal.holder); setQrModal(null); setQrUrl(''); }} />}

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

  // Poll every 30s so delivery status refreshes without a manual reload.
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [q, status, eventId]);

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
                        {p.phone && <button className="btn btn-ghost btn-sm" onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image, p.event_name, p.qr_content)}><WhatsAppIcon size={14} /></button>}
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
                  {p.phone && <button className="btn btn-ghost btn-sm" onClick={() => shareWhatsApp(p.id, p.phone, p.donor_name, p.token, p.qr_image, p.event_name, p.qr_content)}><WhatsAppIcon size={14} /> WA</button>}
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

  return role === 'admin' ? <AllPasses role={role} /> : <MyPasses />;
}
