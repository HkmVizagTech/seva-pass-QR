import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import passRoutes from './routes/passes.js';
import statsRoutes from './routes/stats.js';
import publicRoutes from './routes/public.js';
import preacherRoutes from './routes/preachers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express app (routes + static client). Pure construction — no
 * listening, no DB connection — so it can be used by both the long-running
 * server (index.js) and the Vercel serverless function (api/index.js).
 */
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/events', requireAuth, eventRoutes);
  app.use('/api/passes', requireAuth, passRoutes);
  app.use('/api/stats', requireAuth, statsRoutes);
  app.use('/api/preachers', preacherRoutes);
  app.use('/api/public', publicRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
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
