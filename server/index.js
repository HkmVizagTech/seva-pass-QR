import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB, seedAdmin } from './db.js';

const PORT = process.env.PORT || 4000;

connectDB()
  .then(seedAdmin)
  .then(() => {
    createApp().listen(PORT, () => {
      console.log(`Seva Pass API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
