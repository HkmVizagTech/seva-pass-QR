import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, parseDate } from '../api.js';

function extractToken(text) {
  try {
    const url = new URL(text);
    const t = url.searchParams.get('t');
    if (t) return t;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  } catch {
    return text.trim();
  }
  return text.trim();
}

export default function ScanPass() {
  const readerRef = useRef(null);
  const scannerRef = useRef(null);
  const [result, setResult] = useState(null);
  const [already, setAlready] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (scannerRef.current && scanning) {
        scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {});
      }
    };
  }, [scanning]);

  const startCamera = async () => {
    setCameraError('');
    setResult(null);
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => handleScan(decoded),
        () => {}
      );
    } catch (e) {
      setCameraError('Could not start the camera. You can enter the code manually below.');
      setScanning(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {}
      setScanning(false);
    }
  };

  const handleScan = async (text) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const token = extractToken(text);
      const data = await api.checkIn(token);
      setResult(data.pass);
      setAlready(data.already);
      if (scannerRef.current) {
        await stopCamera();
      }
    } catch (e) {
      setResult(null);
      setCameraError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const manualSubmit = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    handleScan(manual.trim());
    setManual('');
  };

  return (
    <div>
      <header className="page-header">
        <h1>Scan &amp; Validate</h1>
        <p>Point the camera at a pass QR to check the guest in</p>
      </header>

      <div className="scan-layout">
        <div className="panel scan-panel">
          <div id="qr-reader" className="qr-reader" />
          {!scanning && !cameraError && (
            <button className="btn btn-primary btn-block" onClick={startCamera}>Start camera</button>
          )}
          {scanning && (
            <button className="btn btn-ghost btn-block" onClick={stopCamera}>Stop camera</button>
          )}
          {cameraError && <div className="alert alert-warn">{cameraError}</div>}

          <form onSubmit={manualSubmit} className="form form-inline">
            <input
              className="input"
              placeholder="Or paste the pass code / URL here…"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button className="btn" disabled={busy || !manual.trim()}>Validate</button>
          </form>
        </div>

        <div className="panel scan-result">
          <h2>Result</h2>
          {busy && <p className="muted">Checking…</p>}
          {!busy && !result && !cameraError && <p className="muted">No scan yet. Scan a pass QR to validate it.</p>}
          {!busy && !result && cameraError && <p className="muted">—</p>}
          {result && (
            <div>
              <div className={`scan-banner ${result.status === 'used' ? 'ok' : 'warn'}`}>
                {already ? 'Already checked in' : result.status === 'revoked' ? 'REVOKED' : 'Checked in successfully'}
              </div>
              <div className="pass-card-details">
                <div className="pass-card-name">{result.donor_name}</div>
                <div className="pass-card-type">{result.pass_type}</div>
                <div className="sub">Event: {result.event_name || '—'}</div>
                {result.checked_in_at && (
                  <div className="sub">
                    Entry time: {parseDate(result.checked_in_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
