import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, seedAdmin } from './db.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import passRoutes from './routes/passes.js';
import statsRoutes from './routes/stats.js';
import publicRoutes from './routes/public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/events', requireAuth, eventRoutes);
app.use('/api/passes', requireAuth, passRoutes);
app.use('/api/stats', requireAuth, statsRoutes);
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

connectDB()
  .then(seedAdmin)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Seva Pass API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
