import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, parseDate, formatDateTime } from '../api.js';
import { PrintIcon, CheckIcon, ShieldIcon } from '../components/icons.jsx';

function fmt(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString() : '—';
}

function ScanProgress({ scanStatus }) {
  if (!scanStatus || scanStatus.length === 0) return null;

  const granted = scanStatus.filter((s) => s.result === 'granted');
  const hasBahumana = granted.some((s) => {
    const label = (s.stationLabel || '').toLowerCase();
    return label.includes('bahumana');
  });

  return (
    <div className="scan-progress">
      <div className="scan-progress-title">Pass Scan Status</div>
      <div className="scan-progress-items">
        {granted.map((s, i) => (
          <div key={i} className="scan-progress-item scanned">
            <span className="scan-icon">✅</span>
            <div className="scan-info">
              <span className="scan-station">{s.stationLabel || 'Station'}</span>
              <span className="scan-time">{s.scannedAt ? formatDateTime(s.scannedAt) : ''}</span>
            </div>
          </div>
        ))}
      </div>
      {hasBahumana && (
        <div className="scan-bahumana-badge">
          🎉 Prasadam received by devotee
        </div>
      )}
    </div>
  );
}

export default function PublicPass() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError('No pass code provided. Please scan the full QR code.');
      setLoading(false);
      return;
    }
    api
      .publicPass(token)
      .then(({ pass }) => setPass(pass))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const print = () => window.print();

  return (
    <div className="public-page">
      <div className="public-topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ color: '#fff' }}>
          ← Back
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ color: '#fff' }}>
          Home
        </button>
      </div>

      {loading && (
        <div className="public-card fade-up" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="loading">Loading pass…</div>
        </div>
      )}

      {error && (
        <div className="public-card error-card fade-up">
          <div className="public-status">🙏</div>
          <h1>{error}</h1>
        </div>
      )}

      {!loading && pass && (
        <div className="public-card fade-up">
          <div className="public-top">
            <span className="brand-logo large">ॐ</span>
            <div className="public-org">ISKCON Visakhapatnam · Seva Pass</div>
            <h1>{pass.event_name || 'Entry Pass'}</h1>
            {pass.event_date && <p className="public-meta">{fmt(pass.event_date)}</p>}
            {pass.event_location && <p className="public-meta">{pass.event_location}</p>}
          </div>

          <div className={`public-status-banner status-${pass.status}`}>
            {pass.status === 'used' ? (
              <>
                <CheckIcon size={15} /> Entry confirmed · {pass.checked_in_at ? parseDate(pass.checked_in_at).toLocaleString() : '—'}
              </>
            ) : pass.status === 'revoked' ? (
              <>
                <ShieldIcon size={15} /> This pass has been revoked
              </>
            ) : (
              <>
                <ShieldIcon size={15} /> Entry pass · valid for the event
              </>
            )}
          </div>

          <div className="public-name">{pass.donor_name}</div>
          <div className="public-type">{pass.pass_type}</div>

          {(pass.valid_from || pass.valid_until) && (
            <div className="public-meta">
              Valid: {pass.valid_from ? fmt(pass.valid_from) : '—'}
              {' → '}
              {pass.valid_until ? fmt(pass.valid_until) : '—'}
            </div>
          )}

          <div className="public-qr">
            <img src={pass.qr_image || pass.qr_svg} alt="Pass QR code" />
          </div>

          <ScanProgress scanStatus={pass.scan_status} />

          <div className="public-footer">
            <div className="public-qr-hint">Show this pass QR at the gate for validation</div>
            <div className="public-note">Hare Krishna · All glories to Srila Prabhupada</div>
            <button className="btn btn-ghost btn-sm" onClick={print}>
              <PrintIcon size={15} /> Print this pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
