import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Pass from '../models/Pass.js';
import { requireAuth, signToken, publicUser } from '../auth.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/login', wrap(async (req, res) => {
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
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user: publicUser(user) });
}));

router.get('/users', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const users = await User.find().select('username name role quota created_at').sort({ created_at: 1 }).lean();

  // Count non-revoked passes per devotee so the admin page can show quota usage.
  const usedByUser = await Pass.aggregate([
    { $match: { issued_by: { $in: users.map((u) => u._id) }, status: { $ne: 'revoked' } } },
    { $group: { _id: '$issued_by', count: { $sum: 1 } } },
  ]);
  const usedMap = new Map(usedByUser.map((r) => [String(r._id), r.count]));
  const withUsage = users.map((u) => ({
    id: u._id.toString(),
    username: u.username,
    name: u.name,
    role: u.role,
    quota: u.quota || 30,
    created_at: u.created_at,
    used: usedMap.get(String(u._id)) || 0,
  }));

  res.json({ users: withUsage });
}));

router.post('/users', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { username, password, name, role = 'devotee', quota } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'username, password and name are required' });
  }
  const exists = await User.findOne({ username: username.trim().toLowerCase() });
  if (exists) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  if (quota !== undefined && (!Number.isInteger(Number(quota)) || Number(quota) < 1)) {
    return res.status(400).json({ error: 'quota must be a positive integer' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = await User.create({
    username: username.trim(),
    password_hash: hash,
    name: name.trim(),
    role,
    quota: quota === undefined ? undefined : Number(quota),
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
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { name, role, quota, password } = req.body || {};

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
  if (password !== undefined && password !== '') {
    user.password_hash = bcrypt.hashSync(password, 10);
  }

  await user.save();
  res.json({ user: publicUser(user) });
}));

export default router;
