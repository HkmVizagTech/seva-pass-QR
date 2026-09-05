import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import passRoutes from './routes/passes.js';
import statsRoutes from './routes/stats.js';
import publicRoutes from './routes/public.js';
import preacherRoutes from './routes/preachers.js';
import webhookRoutes from './routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express app (routes + static client). Pure construction — no
 * listening, no DB connection — so it can be used by both the long-running
 * server (index.js) and the Vercel serverless function (api/index.js).
 */
export function createApp() {
  const app = express();

  // Railway / Vercel put a proxy in front of us. Without this, req.ip is the
  // proxy's address for EVERY request, so express-rate-limit buckets all users
  // into one counter — 30 logins per 15 minutes for the entire organisation.
  app.set('trust proxy', 1);

  // CORS — restrict to known origins in production via ALLOWED_ORIGINS env var.
  // Format: comma-separated list, e.g. "https://seva-pass.vercel.app,https://seva-pass-qr-server.vercel.app"
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors(
    allowedOrigins.length > 0
      ? {
          origin(origin, cb) {
            // Allow requests with no origin (curl, server-to-server).
            // Always allow localhost (Capacitor native app WebView).
            if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
            cb(new Error('Not allowed by CORS'));
          },
        }
      : {}
  ));
  app.use(express.json({ limit: '1mb' }));

  // Global rate limit — generous ceiling for normal usage.
  const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
  app.use('/api/', globalLimiter);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/events', requireAuth, eventRoutes);
  app.use('/api/passes', requireAuth, passRoutes);
  app.use('/api/stats', requireAuth, statsRoutes);
  app.use('/api/preachers', preacherRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/webhooks/whatsapp', webhookRoutes);

  app.use((err, req, res, next) => {
    // Operational errors (MainSystemError and friends) carry their own status.
    // Honour it — collapsing everything to 500 meant an expired main-system
    // session reached the client as "Internal server error" instead of a 401,
    // so the client never cleared the dead token and the user was stuck in a
    // permanent "session expired" loop with no way to log in again.
    const status = Number(err.status || err.statusCode);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      const body = { error: err.message || 'Request failed' };
      if (err.code) body.code = err.code;
      return res.status(status).json(body);
    }
    console.error(err);
    // In production, only send generic errors to the client.
    const msg = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (err.message || 'Internal server error');
    res.status(status >= 500 && status < 600 ? status : 500).json({ error: msg });
  });

  const distDir = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
