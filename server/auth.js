import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start without a secure secret.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '7d';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signToken(user, extra = {}, opts = {}) {
  const expiresIn = opts.expiresIn || TOKEN_TTL;
  return jwt.sign({ id: user.id, username: user.username, role: user.role, ...extra }, JWT_SECRET, {
    expiresIn,
  });
}

/**
 * Lifetime (in seconds) an app session should get when it wraps a main-system
 * token.  The app session must never outlive the main-system token it carries:
 * if it does, the app JWT keeps validating while every proxied call to the main
 * system 401s, and the user is stuck on "Preacher session expired" without ever
 * being logged out.  We read the main token's own `exp` (no verification — we
 * don't hold the main system's secret, we only need the claim) and expire the
 * app session 60s earlier, capped at our own 7-day ceiling.
 */
export function sessionTtlForMainToken(mainToken) {
  try {
    const decoded = jwt.decode(mainToken);
    const exp = decoded && Number(decoded.exp);
    if (!exp || !Number.isFinite(exp)) return TOKEN_TTL_SECONDS;
    const remaining = Math.floor(exp - Date.now() / 1000) - 60;
    if (remaining <= 0) return 60; // already dead — let it fail fast and cleanly
    return Math.min(remaining, TOKEN_TTL_SECONDS);
  } catch {
    return TOKEN_TTL_SECONDS;
  }
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
    return res.status(401).json({ error: 'Your session has ended. Please log in again.', code: 'SESSION_EXPIRED' });
  }
}
