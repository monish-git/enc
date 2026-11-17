import { Session } from '../models/Session.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { SecurityEvent } from '../models/SecurityEvent.js';
import { User } from '../models/User.js';
import { HttpError, ah } from '../utils/errors.js';
import { toEvent, logEvent } from '../services/events.js';
import { disconnectSession, emitToSession } from '../services/realtime.js';

const toSession = (s, currentId) => ({
  id: String(s._id),
  userAgent: s.userAgent,
  ip: s.ip,
  createdAt: s.createdAt,
  lastSeenAt: s.lastSeenAt,
  expiresAt: s.expiresAt,
  current: String(s._id) === String(currentId),
});

const toLogin = (l) => ({
  id: String(l._id),
  success: l.success,
  reason: l.reason,
  ip: l.ip,
  userAgent: l.userAgent,
  createdAt: l.createdAt,
});

export const overview = ah(async (req, res) => {
  const uid = req.user._id;
  const day = new Date(Date.now() - 24 * 3600 * 1000);
  const month = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [sessions, logins, failed24h, failed30d, recentFailed, events, user] = await Promise.all([
    Session.find({ user: uid, revoked: false, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).limit(20),
    LoginEvent.find({ user: uid }).sort({ createdAt: -1 }).limit(15),
    LoginEvent.countDocuments({ user: uid, success: false, createdAt: { $gt: day } }),
    LoginEvent.countDocuments({ user: uid, success: false, createdAt: { $gt: month } }),
    LoginEvent.find({ user: uid, success: false }).sort({ createdAt: -1 }).limit(10),
    SecurityEvent.find({ user: uid }).sort({ createdAt: -1 }).limit(100),
    User.findById(uid).select('notificationsSeenAt'),
  ]);

  const seenAt = user?.notificationsSeenAt || new Date(0);
  const notifications = events
    .filter((e) => e.level !== 'info')
    .slice(0, 30)
    .map((e) => ({ ...toEvent(e), unread: e.createdAt > seenAt }));

  res.json({
    sessions: sessions.map((s) => toSession(s, req.session._id)),
    logins: logins.map(toLogin),
    failed: { last24h: failed24h, last30d: failed30d, recent: recentFailed.map(toLogin) },
    events: events.map(toEvent).reverse(), // oldest -> newest for the terminal log
    notifications,
    unreadNotifications: notifications.filter((n) => n.unread).length,
  });
});

export const unreadNotifications = ah(async (req, res) => {
  const seenAt = req.user.notificationsSeenAt || new Date(0);
  const count = await SecurityEvent.countDocuments({
    user: req.user._id,
    level: { $ne: 'info' },
    createdAt: { $gt: seenAt },
  });
  res.json({ count });
});

export const markNotificationsRead = ah(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { notificationsSeenAt: new Date() } });
  res.json({ ok: true });
});

export const revokeSession = ah(async (req, res) => {
  const s = await Session.findOne({ _id: req.params.id, user: req.user._id });
  if (!s) throw new HttpError(404, 'SESSION NOT FOUND', 'NOT_FOUND');
  s.revoked = true;
  await s.save();
  emitToSession(String(s._id), 'session:revoked', { reason: 'SESSION REVOKED' });
  disconnectSession(String(s._id));
  await logEvent(req.user._id, 'SESSION_REVOKED', 'A SESSION WAS REVOKED', 'warn');
  res.json({ ok: true });
});

export const revokeOthers = ah(async (req, res) => {
  const others = await Session.find({ user: req.user._id, revoked: false, _id: { $ne: req.session._id } }).select('_id');
  await Session.updateMany({ _id: { $in: others.map((s) => s._id) } }, { $set: { revoked: true } });
  others.forEach((s) => {
    emitToSession(String(s._id), 'session:revoked', { reason: 'SESSION REVOKED' });
    disconnectSession(String(s._id));
  });
  await logEvent(req.user._id, 'SESSION_REVOKED', `${others.length} OTHER SESSION(S) REVOKED`, 'warn');
  res.json({ ok: true, count: others.length });
});
