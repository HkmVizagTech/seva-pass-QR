import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

const DEFAULT_URI = 'mongodb://localhost:27017/seva_pass';
const CONNECT_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uriLabel(uri) {
  return uri.split('@').pop().split('/').shift();
}

function isDnsLevelError(err) {
  return /querySrv|_mongodb\._tcp|ENOTFOUND/.test(err.message || '');
}

async function tryUri(uri, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS });
      return { ok: true };
    } catch (err) {
      const dnsLevel = isDnsLevelError(err);
      if (attempt === maxAttempts || dnsLevel) {
        return { ok: false, error: err, dnsLevel };
      }
      console.warn(`Mongo connect attempt ${attempt} failed (${err.message}) — retrying…`);
      await sleep(1500);
    }
  }
  return { ok: false };
}

export async function connectDB() {
  const uris = [...new Set([process.env.MONGODB_URI || DEFAULT_URI, process.env.MONGODB_DIRECT_URI].filter(Boolean))];

  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI not set — falling back to local MongoDB. Set MONGODB_URI in server/.env for MongoDB Atlas.');
  }

  let lastError;
  for (const uri of uris) {
    const result = await tryUri(uri);
    if (result.ok) {
      console.log(`Connected to MongoDB (${uriLabel(uri)})`);
      return;
    }
    lastError = result.error;
    if (result.dnsLevel && uris.length > 1) {
      console.warn(`SRV lookup failed for ${uriLabel(uri)} on this machine — trying the next URI.`);
    }
  }
  throw lastError || new Error('Could not connect to MongoDB');
}

export async function seedAdmin() {
  const count = await User.estimatedDocumentCount();
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  await User.create({ username: 'admin', password_hash: hash, name: 'Administrator', role: 'admin' });
  console.log('Seeded default admin user. Change the password immediately.');
}
