import crypto from 'node:crypto';
import { Session } from '../models/Session.js';
import { env } from '../config/env.js';
import { COOKIE_NAME_DEV, COOKIE_NAME_PROD } from '../config/constants.js';

export const COOKIE_NAME = env.cookieSecure ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').slice(0, 64);
}

export async function createSession(req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const session = await Session.create({
    user: userId,
    tokenHash: hashToken(token),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + env.sessionTtlMs),
  });
  return { token, session };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.crossSite ? 'none' : 'lax',
    path: '/',
    maxAge: env.sessionTtlMs,
  };
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
}

export async function findValidSession(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session || session.revoked || session.expiresAt <= new Date()) return null;
  return session;
}

// Sliding expiry, written at most every 5 minutes to keep DB writes low.
export async function touchSession(session) {
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    session.lastSeenAt = new Date(now);
    session.expiresAt = new Date(now + env.sessionTtlMs);
    await session.save();
  }
}
