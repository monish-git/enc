import { User } from '../models/User.js';
import { HttpError, ah } from '../utils/errors.js';
import { COOKIE_NAME, findValidSession, touchSession } from '../services/sessions.js';

export const requireAuth = ah(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  const session = await findValidSession(token);
  if (!session) throw new HttpError(401, 'AUTHENTICATION REQUIRED', 'UNAUTHENTICATED');
  const user = await User.findById(session.user);
  if (!user) throw new HttpError(401, 'AUTHENTICATION REQUIRED', 'UNAUTHENTICATED');
  await touchSession(session);
  req.user = user;
  req.session = session;
  next();
});
