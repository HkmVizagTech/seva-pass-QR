import 'dotenv/config';
import { createApp } from '../server/app.js';
import { connectDB, seedAdmin } from '../server/db.js';

// Cache the DB connection across serverless invocations (Vercel reuses the
// warm instance, so we must not open a new connection per request).
let cached = globalThis.__sevaPassDb;
if (!cached) cached = globalThis.__sevaPassDb = { promise: null };

function initDb() {
  if (!cached.promise) {
    cached.promise = connectDB()
      .then(seedAdmin)
      .catch((err) => {
        console.error('DB init failed:', err.message);
        cached.promise = null; // allow a retry on the next invocation
        throw err;
      });
  }
  return cached.promise;
}

const app = createApp();

export default async function handler(req, res) {
  try {
    await initDb();
  } catch (err) {
    return res.status(503).json({ error: 'Database unavailable. Check MONGODB_URI.' });
  }
  return app(req, res);
}
