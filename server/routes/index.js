import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { authLimiter, messageLimiter, reportLimiter, searchLimiter } from '../middleware/security.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as contacts from '../controllers/contactController.js';
import * as conversations from '../controllers/conversationController.js';
import * as messages from '../controllers/messageController.js';
import * as security from '../controllers/securityController.js';

const r = Router();

r.get('/health', (_req, res) => res.json({ ok: true, service: 'ecn', time: new Date().toISOString() }));

// --- auth
r.post('/auth/register', authLimiter, validate(schemas.register), auth.register);
r.post('/auth/login', authLimiter, validate(schemas.login), auth.login);
r.post('/auth/logout', requireAuth, auth.logout);
r.get('/auth/me', requireAuth, auth.me);
r.post('/auth/socket-ticket', requireAuth, auth.socketTicket);
r.post('/auth/change-password', requireAuth, authLimiter, validate(schemas.changePassword), auth.changePassword);

// --- users
r.get('/users/search', requireAuth, searchLimiter, validate(schemas.search, 'query'), users.search);
r.put('/users/me/settings', requireAuth, validate(schemas.settings), users.updateSettings);
r.post('/users/me/reset-key', requireAuth, authLimiter, validate(schemas.resetKey), users.resetKey);

// --- contacts
r.get('/contacts', requireAuth, contacts.list);
r.post('/contacts/request', requireAuth, validate(schemas.contactRequest), contacts.request);
r.post('/contacts/:id/accept', requireAuth, validate(schemas.idParam, 'params'), contacts.accept);
r.post('/contacts/:id/reject', requireAuth, validate(schemas.idParam, 'params'), contacts.reject);
r.delete('/contacts/:id', requireAuth, validate(schemas.idParam, 'params'), contacts.remove);

// --- conversations + messages
r.get('/conversations', requireAuth, conversations.list);
r.get('/conversations/unread', requireAuth, conversations.unreadSummary);
r.post('/conversations', requireAuth, validate(schemas.newConversation), conversations.create);
r.get('/conversations/:id', requireAuth, validate(schemas.idParam, 'params'), conversations.getOne);
r.get('/conversations/:id/messages', requireAuth, validate(schemas.idParam, 'params'), validate(schemas.messageList, 'query'), conversations.messages);
r.post('/conversations/:id/messages', requireAuth, messageLimiter, validate(schemas.idParam, 'params'), validate(schemas.sendMessage), conversations.send);
r.post('/conversations/:id/read', requireAuth, validate(schemas.idParam, 'params'), conversations.markRead);
r.put('/conversations/:id/archive', requireAuth, validate(schemas.idParam, 'params'), validate(schemas.archive), conversations.setArchived);
r.delete('/conversations/:id', requireAuth, validate(schemas.idParam, 'params'), conversations.remove);

r.get('/messages/sent', requireAuth, validate(schemas.messageList, 'query'), messages.sent);
r.post('/messages/:id/report', requireAuth, reportLimiter, validate(schemas.idParam, 'params'), validate(schemas.report), messages.report);

// --- security center
r.get('/security/overview', requireAuth, security.overview);
r.get('/security/notifications/unread', requireAuth, security.unreadNotifications);
r.post('/security/notifications/read', requireAuth, security.markNotificationsRead);
r.post('/security/sessions/revoke-others', requireAuth, security.revokeOthers);
r.post('/security/sessions/:id/revoke', requireAuth, validate(schemas.idParam, 'params'), security.revokeSession);

export default r;
