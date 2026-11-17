import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Short-lived signed ticket used to authenticate the Socket.IO handshake without relying on
// cookies (cookies are not sent cross-site by Safari/Firefox). Ticket = base64url(payload).HMAC
const mac = (payload) => crypto.createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');

export function signTicket(userId, sessionId) {
  const payload = Buffer.from(
    JSON.stringify({ u: String(userId), s: String(sessionId), e: Date.now() + env.ticketTtlMs })
  ).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

export function verifyTicket(ticket) {
  if (typeof ticket !== 'string' || ticket.length > 500) return null;
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return null;
  const expected = mac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.e !== 'number' || data.e < Date.now()) return null;
    return { userId: data.u, sessionId: data.s };
  } catch {
    return null;
  }
}
