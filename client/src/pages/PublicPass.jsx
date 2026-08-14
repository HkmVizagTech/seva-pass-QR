import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, parseDate } from '../api.js';

export default function PublicPass() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('No pass code provided. Please scan the full QR code.');
      return;
    }
    api
      .publicPass(token)
      .then(({ pass }) => setPass(pass))
      .catch((e) => setError(e.message));
  }, [token]);

  const print = () => window.print();

  return (
    <div className="public-page">
      {error && (
        <div className="public-card error-card">
          <div className="public-status">😔</div>
          <h1>{error}</h1>
        </div>
      )}

      {pass && (
        <div className="public-card">
          <div className="public-top">
            <div className="brand-logo large">ॐ</div>
            <div className="public-org">Seva Pass</div>
            <h1>{pass.event_name || 'Entry Pass'}</h1>
            {pass.event_date && <p className="public-meta">{new Date(pass.event_date).toLocaleDateString()}</p>}
            {pass.event_location && <p className="public-meta">{pass.event_location}</p>}
          </div>

          <div className={`public-status-banner status-${pass.status}`}>
            {pass.status === 'used'
              ? `Entry confirmed · ${parseDate(pass.checked_in_at).toLocaleString()}`
              : pass.status === 'revoked'
                ? 'This pass has been revoked'
                : 'Entry pass'}
          </div>

          <div className="public-name">{pass.donor_name}</div>
          <div className="public-type">{pass.pass_type}</div>

          {(pass.valid_from || pass.valid_until) && (
            <div className="public-meta">
              Valid: {pass.valid_from ? new Date(pass.valid_from).toLocaleDateString() : '—'}
              {' → '}
              {pass.valid_until ? new Date(pass.valid_until).toLocaleDateString() : '—'}
            </div>
          )}

          <div className="public-qr">
            <img src={pass.qr_image || pass.qr_svg} alt="Pass QR code" />
          </div>

          <div className="public-footer">
            <div className="public-qr-hint">Show this pass QR at the gate for validation</div>
            <div className="public-note">Hare Krishna · All glories to Srila Prabhupada</div>
            <button className="btn btn-ghost btn-sm" onClick={print}>Print this pass</button>
          </div>
        </div>
      )}
    </div>
  );
}
