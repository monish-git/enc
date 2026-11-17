import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { verifyTicket } from '../services/ticket.js';
import { addSocket, removeSocket } from '../services/presence.js';
import { emitToUser, setIO } from '../services/realtime.js';
import { getContactIds, areContacts } from '../services/contacts.js';

async function broadcastPresence(userId, online) {
  const lastSeen = new Date();
  if (!online) await User.updateOne({ _id: userId }, { $set: { lastSeen } });
  const contacts = await getContactIds(userId);
  for (const cid of contacts) {
    emitToUser(cid, 'presence', { userId: String(userId), online, lastSeen: online ? null : lastSeen });
  }
}

// Messages that arrived while the recipient was offline become "delivered" on connect.
async function deliverPending(userId) {
  const pending = await Message.find({ recipient: userId, status: 'sent' }).select('_id conversation sender');
  if (!pending.length) return;
  await Message.updateMany(
    { _id: { $in: pending.map((m) => m._id) } },
    { $set: { status: 'delivered', deliveredAt: new Date() } }
  );
  const groups = new Map();
  for (const m of pending) {
    const key = `${m.sender}|${m.conversation}`;
    if (!groups.has(key)) groups.set(key, { sender: m.sender, conversation: m.conversation, ids: [] });
    groups.get(key).ids.push(String(m._id));
  }
  for (const g of groups.values()) {
    emitToUser(g.sender, 'message:status', { conversationId: String(g.conversation), ids: g.ids, status: 'delivered' });
  }
}

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024, // messages travel over REST; sockets only carry small events
    cors: { origin: env.clientOrigins, credentials: true },
  });
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin) {
        const host = socket.handshake.headers.host;
        const sameHost = origin.endsWith(`//${host}`);
        if (!sameHost && !env.clientOrigins.includes(origin.replace(/\/$/, ''))) {
          return next(new Error('ORIGIN_NOT_ALLOWED'));
        }
      }
      const data = verifyTicket(socket.handshake.auth?.ticket);
      if (!data) return next(new Error('AUTH_REQUIRED'));
      const session = await Session.findById(data.sessionId);
      if (!session || session.revoked || session.expiresAt <= new Date() || String(session.user) !== data.userId) {
        return next(new Error('AUTH_REQUIRED'));
      }
      socket.data.userId = data.userId;
      socket.data.sessionId = data.sessionId;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, sessionId } = socket.data;
    socket.join(`user:${userId}`);
    socket.join(`session:${sessionId}`);

    const first = addSocket(userId, socket.id);
    try {
      if (first) await broadcastPresence(userId, true);
      await deliverPending(userId);
    } catch (err) {
      console.error('[ECN] socket connect handler:', err.message);
    }

    // very small per-socket rate limit for client events
    let count = 0;
    const timer = setInterval(() => (count = 0), 10_000);
    const allowed = () => ++count <= 60;

    const peerCache = new Map(); // conversationId -> { peerId, at }
    socket.on('typing', async (payload) => {
      try {
        if (!allowed()) return;
        const convId = payload?.conversationId;
        if (typeof convId !== 'string' || !mongoose.isValidObjectId(convId)) return;
        let hit = peerCache.get(convId);
        if (!hit || Date.now() - hit.at > 60_000) {
          const conv = await Conversation.findOne({ _id: convId, participants: userId }).select('participants');
          if (!conv) return;
          const peerId = String(conv.participants.find((p) => String(p) !== userId));
          if (!(await areContacts(userId, peerId))) return;
          hit = { peerId, at: Date.now() };
          peerCache.set(convId, hit);
        }
        emitToUser(hit.peerId, 'typing', { conversationId: convId, userId, typing: !!payload.typing });
      } catch {
        /* ignore */
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(timer);
      if (removeSocket(userId, socket.id)) {
        try {
          await broadcastPresence(userId, false);
        } catch (err) {
          console.error('[ECN] socket disconnect handler:', err.message);
        }
      }
    });
  });

  return io;
}
