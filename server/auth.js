import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start without a secure secret.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '7d';

export function signToken(user, extra = {}) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, ...extra }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    quota: user.quota || 30,
    short_code: user.short_code || '',
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
