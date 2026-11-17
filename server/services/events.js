import { SecurityEvent } from '../models/SecurityEvent.js';
import { emitToUser } from './realtime.js';

// Records a security log line for a user. `message` must never contain secrets or message content.
export async function logEvent(userId, type, message, level = 'info') {
  try {
    const ev = await SecurityEvent.create({ user: userId, type, message, level });
    emitToUser(userId, 'security:event', toEvent(ev));
    return ev;
  } catch (err) {
    console.error('[ECN] failed to write security event:', err.message);
    return null;
  }
}

export const toEvent = (e) => ({
  id: String(e._id),
  type: e.type,
  level: e.level,
  message: e.message,
  createdAt: e.createdAt,
});
