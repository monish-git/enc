import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence for cookie auth: state-changing requests must carry a custom header (which forces a
// CORS preflight for cross-site pages) and, when the browser sends an Origin, it must be allowed.
export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'ECN') {
    return res.status(403).json({ error: 'CSRF CHECK FAILED', code: 'CSRF' });
  }
  const origin = req.get('origin');
  if (origin) {
    const sameHost = origin === `${req.protocol}://${req.get('host')}`;
    if (!sameHost && !env.clientOrigins.includes(origin.replace(/\/$/, ''))) {
      return res.status(403).json({ error: 'ORIGIN NOT ALLOWED', code: 'CSRF' });
    }
  }
  next();
}

export function httpsRedirect(req, res, next) {
  if (!env.forceHttps) return next();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  if (proto === 'https') return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  }
  return res.status(403).json({ error: 'HTTPS REQUIRED', code: 'HTTPS_REQUIRED' });
}

const limiterBase = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'TOO MANY REQUESTS - SLOW DOWN', code: 'RATE_LIMITED' }),
};

export const apiLimiter = rateLimit({ ...limiterBase, windowMs: 60_000, limit: 600 });
export const authLimiter = rateLimit({ ...limiterBase, windowMs: 15 * 60_000, limit: 40 });
export const searchLimiter = rateLimit({ ...limiterBase, windowMs: 60_000, limit: 60 });
export const messageLimiter = rateLimit({
  ...limiterBase,
  windowMs: 60_000,
  limit: 90,
  keyGenerator: (req) => `u:${req.user?._id || req.ip}`,
  validate: false,
});
export const reportLimiter = rateLimit({
  ...limiterBase,
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: (req) => `u:${req.user?._id || req.ip}`,
  validate: false,
});
