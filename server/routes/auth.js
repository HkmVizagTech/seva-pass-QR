import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Pass from '../models/Pass.js';
import { requireAuth, signToken, publicUser } from '../auth.js';
import {
  preacherLogin,
  MainSystemError,
  createMainPreacher,
  listMainPreachers,
  deleteMainPreacher,
} from '../services/mainSystem.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Only rate-limit the actual login endpoints, not /me or /users.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = await User.findOne({ username: username.trim().toLowerCase() });
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  // Main-system devotee sessions don't exist in the app's user collection —
  // their profile was captured from the main system at login time and is
  // embedded in the signed app JWT, so serve it from there.
  if (req.user.main_token) {
    return res.json({
      user: {
        id: req.user.id,
        username: req.user.username || '',
        name: req.user.name || req.user.username || '',
        role: req.user.role || 'devotee',
        shortCode: req.user.shortCode || '',
      },
    });
  }
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user: publicUser(user) });
}));

// Devotee login against the main ISKCON system.
// On success we mint an app JWT carrying the main-system token so later
// requests can be forwarded without asking for credentials again.
router.post('/preacher-login', loginLimiter, wrap(async (req, res) => {
  const { email, phone, password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required' });
  }
  let data;
  try {
    data = await preacherLogin({ email, phone, password });
  } catch (err) {
    if (err instanceof MainSystemError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    throw err;
  }
  const preacher = data.preacher || {};
  const preacherRole = preacher.role || 'devotee';

  // Find or create a local User so issued_by in passes points to a valid
  // local ObjectId.  The short_code links the local user to the main-system
  // preacher, and the main_system_id lets us resolve the mapping later.
  let localUser = null;
  if (preacher.shortCode) {
    localUser = await User.findOne({ short_code: preacher.shortCode.toUpperCase() });
  }
  if (!localUser && email) {
    localUser = await User.findOne({ username: email.trim().toLowerCase() });
  }
  if (!localUser) {
    const shortCode = (preacher.shortCode || '').toUpperCase() || email?.split('@')[0] || 'preacher';
    const hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
    localUser = await User.create({
      username: shortCode,
      password_hash: hash,
      name: (preacher.name || shortCode).trim(),
      role: 'devotee',
      short_code: shortCode,
    });
  }

  const token = signToken(
    {
      id: localUser._id.toString(),
      username: preacher.shortCode || localUser.username || '',
      name: preacher.name || preacher.shortCode || localUser.name || '',
      role: preacherRole,
    },
    { shortCode: preacher.shortCode || '', main_token: data.token }
  );
  res.json({
    token,
    user: {
      id: localUser._id.toString(),
      username: preacher.shortCode || localUser.username || '',
      name: preacher.name || preacher.shortCode || localUser.name || '',
      role: preacherRole,
      shortCode: preacher.shortCode || '',
    },
  });
}));

router.get('/users', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const users = await User.find().select('username name role quota event_quotas short_code created_at').sort({ created_at: 1 }).lean();

  // Count non-revoked passes per devotee (total + per-event) so the admin page
  // can show quota usage for both global and per-event quotas.
  const usedByUser = await Pass.aggregate([
    { $match: { issued_by: { $in: users.map((u) => u._id) }, status: { $ne: 'revoked' } } },
    { $group: { _id: { user: '$issued_by', event: '$event_id' }, count: { $sum: 1 } } },
  ]);
  const usedMap = new Map();
  const usedByEventMap = new Map();
  for (const r of usedByUser) {
    const userId = String(r._id.user);
    const eventId = r._id.event ? String(r._id.event) : null;
    const prev = usedMap.get(userId) || 0;
    usedMap.set(userId, prev + r.count);
    if (eventId) {
      const key = `${userId}:${eventId}`;
      usedByEventMap.set(key, (usedByEventMap.get(key) || 0) + r.count);
    }
  }
  const withUsage = users.map((u) => {
    const eventQuotas = {};
    if (u.event_quotas && u.event_quotas.size) {
      for (const [evId, evQuota] of u.event_quotas) {
        eventQuotas[evId] = {
          quota: evQuota,
          used: usedByEventMap.get(`${u._id}:${evId}`) || 0,
        };
      }
    }
    return {
      id: u._id.toString(),
      username: u.username,
      name: u.name,
      role: u.role,
      quota: u.quota || 30,
      event_quotas: eventQuotas,
      short_code: u.short_code || '',
      created_at: u.created_at,
      used: usedMap.get(String(u._id)) || 0,
    };
  });

  // Also fetch preachers from the main system and merge them into the list
  let mainPreachers = [];
  try {
    mainPreachers = await listMainPreachers();
    if (!Array.isArray(mainPreachers)) mainPreachers = [];
  } catch {
    // Main system might not be configured — that's fine
  }

  // Merge main system preachers that aren't already in local DB.
  // Auto-create a local User record so the admin can manage their quota.
  const localShortCodes = new Set(users.map((u) => (u.short_code || '').toUpperCase()));
  for (const p of mainPreachers) {
    const code = (p.shortCode || '').toUpperCase();
    if (code && !localShortCodes.has(code)) {
      // Create a local user so the admin can edit quota
      const hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
      const localUser = await User.create({
        username: code,
        password_hash: hash,
        name: (p.name || code).trim(),
        role: 'devotee',
        short_code: code,
        quota: 30,
      });
      withUsage.push({
        id: localUser._id.toString(),
        username: localUser.username,
        name: localUser.name,
        role: localUser.role,
        quota: localUser.quota || 30,
        event_quotas: {},
        short_code: localUser.short_code || '',
        created_at: localUser.created_at,
        used: 0,
      });
    }
  }

  res.json({ users: withUsage });
}));

router.post('/users', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { username, password, name, role = 'devotee', quota, short_code, email, phone } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'username, password and name are required' });
  }
  if (!['admin', 'devotee'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or devotee' });
  }
  const exists = await User.findOne({ username: username.trim().toLowerCase() });
  if (exists) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  if (quota !== undefined && (!Number.isInteger(Number(quota)) || Number(quota) < 1)) {
    return res.status(400).json({ error: 'quota must be a positive integer' });
  }
  const cleanCode = String(short_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // All devotees are synced to the main system — email is required.
  if (role === 'devotee') {
    if (!cleanCode) {
      return res.status(400).json({ error: 'short_code is required for devotees' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'email is required for devotees (used to log in on main system)' });
    }
    try {
      await createMainPreacher({
        name: name.trim(),
        email: email || undefined,
        phone: phone || undefined,
        password,
        shortCode: cleanCode,
      });
    } catch (err) {
      // If the main system is not configured (standalone mode), skip sync
      // rather than blocking user creation. The local user is still created.
      if (err instanceof MainSystemError) {
        console.warn(`[Auth] Main system sync skipped for ${username}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await User.create({
    username: username.trim(),
    password_hash: hash,
    name: name.trim(),
    role,
    quota: quota === undefined ? undefined : Number(quota),
    short_code: cleanCode,
  });
  res.status(201).json({ user: publicUser(user) });
}));

router.put('/users/:id', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  let user = await User.findById(req.params.id);
  // If user doesn't exist locally, this might be a main-system preacher.
  // Create a local record so the admin can manage their quota.
  if (!user) {
    const { name, short_code, quota } = req.body || {};
    const cleanCode = String(short_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode) {
      return res.status(404).json({ error: 'User not found' });
    }
    const hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
    user = await User.create({
      username: cleanCode,
      password_hash: hash,
      name: (name || 'Preacher').trim(),
      role: 'devotee',
      quota: quota !== undefined ? Number(quota) : 30,
      short_code: cleanCode,
    });
  }

  const { name, role, quota, password, short_code, event_quotas } = req.body || {};

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'name cannot be empty' });
    user.name = String(name).trim();
  }
  if (role !== undefined) {
    if (!['admin', 'devotee'].includes(role)) return res.status(400).json({ error: 'role must be admin or devotee' });
    user.role = role;
  }
  if (quota !== undefined) {
    if (!Number.isInteger(Number(quota)) || Number(quota) < 1) {
      return res.status(400).json({ error: 'quota must be a positive integer' });
    }
    user.quota = Number(quota);
  }
  if (short_code !== undefined) {
    user.short_code = String(short_code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  if (password !== undefined && password !== '') {
    user.password_hash = bcrypt.hashSync(password, 10);
  }
  if (event_quotas !== undefined && event_quotas !== null) {
    // event_quotas is { eventId: quotaNumber } — only valid ObjectIds with positive ints.
    const cleaned = {};
    if (typeof event_quotas === 'object' && !Array.isArray(event_quotas)) {
      for (const [evId, q] of Object.entries(event_quotas)) {
        if (mongoose.isValidObjectId(evId) && Number.isInteger(Number(q)) && Number(q) >= 1) {
          cleaned[evId] = Number(q);
        }
      }
    }
    user.event_quotas = cleaned;
  }

  await user.save();
  res.json({ user: publicUser(user) });
}));

router.delete('/users/:id', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  // Prevent deleting the last admin account.
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin account' });
    }
  }

  // If deleting a devotee with a main system account, also soft-delete on the main system
  if (user.short_code) {
    try {
      await deleteMainPreacher(user.short_code);
    } catch {
      // Main system might not have this preacher — continue with local delete
    }
  }

  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

export default router;
