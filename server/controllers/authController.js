import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { HttpError, ah } from '../utils/errors.js';
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from '../services/passwords.js';
import {
  clearSessionCookie,
  clientIp,
  createSession,
  setSessionCookie,
} from '../services/sessions.js';
import { signTicket } from '../services/ticket.js';
import { logEvent } from '../services/events.js';
import { toSelf } from '../services/serializers.js';
import { disconnectSession, emitToSession } from '../services/realtime.js';

const fingerprintOf = (b64) => crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

const GENERIC_LOGIN_ERROR = 'INVALID USER ID OR PASSWORD';

export const register = ah(async (req, res) => {
  const { username, email, password, publicKey } = req.valid.body;

  const problem = passwordProblem(password, username);
  if (problem) throw new HttpError(400, problem, 'WEAK_PASSWORD');

  const exists = await User.exists({ $or: [{ username }, { email }] });
  if (exists) throw new HttpError(409, 'USERNAME OR EMAIL ALREADY IN USE', 'DUPLICATE');

  const user = await User.create({
    username,
    email,
    passwordHash: await hashPassword(password),
    publicKey,
    keyFingerprint: fingerprintOf(publicKey),
    keyUpdatedAt: new Date(),
  });

  const { token, session } = await createSession(req, user._id);
  setSessionCookie(res, token);

  await LoginEvent.create({
    user: user._id, identifier: username, success: true, reason: 'ok',
    ip: clientIp(req), userAgent: String(req.get('user-agent') || '').slice(0, 300),
  });
  await logEvent(user._id, 'KEY_REGISTERED', 'IDENTITY PUBLIC KEY REGISTERED (X25519)');
  await logEvent(user._id, 'SESSION_CREATED', 'SECURE SESSION CREATED');

  res.status(201).json({ user: toSelf(user), sessionId: String(session._id) });
});

export const login = ah(async (req, res) => {
  const { identifier, password } = req.valid.body;
  const ip = clientIp(req);
  const userAgent = String(req.get('user-agent') || '').slice(0, 300);

  const query = identifier.includes('@') ? { email: identifier } : { username: identifier };
  const user = await User.findOne(query).select('+passwordHash');

  if (!user) {
    await dummyVerify(password); // equalise timing
    await LoginEvent.create({ user: null, identifier: identifier.slice(0, 80), success: false, reason: 'unknown_user', ip, userAgent });
    throw new HttpError(401, GENERIC_LOGIN_ERROR, 'BAD_CREDENTIALS');
  }

  // Brute-force protection: 5 failures / 15 min per (account, IP), 25 / 15 min per account.
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const [failedFromIp, failedTotal] = await Promise.all([
    LoginEvent.countDocuments({ user: user._id, success: false, ip, createdAt: { $gt: since } }),
    LoginEvent.countDocuments({ user: user._id, success: false, createdAt: { $gt: since } }),
  ]);
  if (failedFromIp >= 5 || failedTotal >= 25) {
    await dummyVerify(password);
    await LoginEvent.create({ user: user._id, identifier: user.username, success: false, reason: 'locked', ip, userAgent });
    res.set('Retry-After', '900');
    throw new HttpError(429, 'TOO MANY FAILED ATTEMPTS - TRY AGAIN IN 15 MINUTES', 'LOCKED');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await LoginEvent.create({ user: user._id, identifier: user.username, success: false, reason: 'bad_password', ip, userAgent });
    await logEvent(user._id, 'LOGIN_FAILED', `FAILED LOGIN ATTEMPT FROM ${ip || 'UNKNOWN IP'}`, 'warn');
    throw new HttpError(401, GENERIC_LOGIN_ERROR, 'BAD_CREDENTIALS');
  }

  const knownDevice = await LoginEvent.exists({ user: user._id, success: true, userAgent });
  const { token, session } = await createSession(req, user._id);
  setSessionCookie(res, token);

  await LoginEvent.create({ user: user._id, identifier: user.username, success: true, reason: 'ok', ip, userAgent });
  await logEvent(user._id, 'AUTH_LOGIN', 'USER AUTHENTICATED');
  await logEvent(user._id, 'SESSION_CREATED', 'SECURE SESSION CREATED');
  if (!knownDevice) {
    await logEvent(user._id, 'NEW_DEVICE', `LOGIN FROM A NEW DEVICE (${ip || 'UNKNOWN IP'})`, 'warn');
  }

  res.json({ user: toSelf(user), sessionId: String(session._id) });
});

export const logout = ah(async (req, res) => {
  const session = req.session;
  session.revoked = true;
  await session.save();
  disconnectSession(String(session._id));
  await logEvent(req.user._id, 'AUTH_LOGOUT', 'USER LOGGED OUT');
  clearSessionCookie(res);
  res.json({ ok: true });
});

export const me = ah(async (req, res) => {
  res.json({ user: toSelf(req.user), sessionId: String(req.session._id) });
});

export const socketTicket = ah(async (req, res) => {
  res.json({ ticket: signTicket(req.user._id, req.session._id) });
});

export const changePassword = ah(async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, 'CURRENT PASSWORD IS INCORRECT', 'BAD_CREDENTIALS');
  }
  const problem = passwordProblem(newPassword, user.username);
  if (problem) throw new HttpError(400, problem, 'WEAK_PASSWORD');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Sign out every other session.
  const others = await Session.find({ user: user._id, revoked: false, _id: { $ne: req.session._id } }).select('_id');
  await Session.updateMany({ _id: { $in: others.map((s) => s._id) } }, { $set: { revoked: true } });
  others.forEach((s) => {
    emitToSession(String(s._id), 'session:revoked', { reason: 'PASSWORD CHANGED' });
    disconnectSession(String(s._id));
  });
  await logEvent(user._id, 'PASSWORD_CHANGED', 'PASSWORD CHANGED - OTHER SESSIONS SIGNED OUT', 'warn');
  res.json({ ok: true, revokedSessions: others.length });
});
