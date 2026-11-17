import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { pairKeyOf } from '../models/Contact.js';
import { HttpError, ah } from '../utils/errors.js';
import { toMessage, toPeer } from '../services/serializers.js';
import { areContacts } from '../services/contacts.js';
import { emitToUser } from '../services/realtime.js';
import { isOnline } from '../services/presence.js';
import { logEvent } from '../services/events.js';

const PEER_FIELDS = 'username statusMessage publicKey keyFingerprint lastSeen';

async function loadMine(req) {
  const conv = await Conversation.findOne({ _id: req.params.id, participants: req.user._id });
  if (!conv) throw new HttpError(404, 'CONVERSATION NOT FOUND', 'NOT_FOUND');
  return conv;
}

const otherParticipant = (conv, meId) => conv.participants.find((p) => String(p) !== String(meId));

async function describe(conv, me, peerDoc) {
  const peer = peerDoc || (await User.findById(otherParticipant(conv, me._id)).select(PEER_FIELDS));
  const st = conv.stateFor(me._id);
  const clearedAt = st?.clearedAt || null;
  const visible = clearedAt ? { createdAt: { $gt: clearedAt } } : {};

  const [last, unread, canMessage] = await Promise.all([
    Message.findOne({ conversation: conv._id, ...visible }).sort({ createdAt: -1 }).select('sender createdAt status ciphertext'),
    Message.countDocuments({ conversation: conv._id, recipient: me._id, status: { $ne: 'read' }, ...visible }),
    peer ? areContacts(me._id, peer._id) : false,
  ]);

  return {
    id: String(conv._id),
    peer: peer ? toPeer(peer) : null,
    archived: !!st?.archived,
    canMessage,
    unread,
    lastMessageAt: conv.lastMessageAt,
    lastMessage: last
      ? {
          id: String(last._id),
          mine: String(last.sender) === String(me._id),
          status: last.status,
          createdAt: last.createdAt,
          // ciphertext teaser only - the server has nothing else to show
          preview: last.ciphertext.slice(0, 32),
        }
      : null,
  };
}

export const list = ah(async (req, res) => {
  const wantArchived = req.query.archived === 'true';
  const convs = await Conversation.find({ participants: req.user._id }).sort({ lastMessageAt: -1 }).limit(200);
  const mine = convs.filter((c) => {
    const st = c.stateFor(req.user._id);
    return !st?.deleted && !!st?.archived === wantArchived;
  });
  const peerIds = mine.map((c) => otherParticipant(c, req.user._id));
  const peers = await User.find({ _id: { $in: peerIds } }).select(PEER_FIELDS);
  const byId = new Map(peers.map((p) => [String(p._id), p]));
  const conversations = await Promise.all(
    mine.map((c) => describe(c, req.user, byId.get(String(otherParticipant(c, req.user._id)))))
  );
  res.json({ conversations: conversations.filter((c) => c.peer) });
});

export const unreadSummary = ah(async (req, res) => {
  const total = await Message.countDocuments({ recipient: req.user._id, status: { $ne: 'read' } });
  res.json({ unread: total });
});

export const getOne = ah(async (req, res) => {
  const conv = await loadMine(req);
  res.json({ conversation: await describe(conv, req.user) });
});

export const create = ah(async (req, res) => {
  const { userId } = req.valid.body;
  if (userId === String(req.user._id)) throw new HttpError(400, 'CANNOT MESSAGE YOURSELF', 'VALIDATION');
  if (!(await areContacts(req.user._id, userId))) {
    throw new HttpError(403, 'YOU CAN ONLY MESSAGE ACCEPTED CONTACTS', 'NOT_CONTACTS');
  }
  const pairKey = pairKeyOf(req.user._id, userId);
  let conv = await Conversation.findOne({ pairKey });
  if (!conv) {
    const participants = [req.user._id, userId].sort((a, b) => String(a).localeCompare(String(b)));
    try {
      conv = await Conversation.create({
        participants,
        pairKey,
        state: participants.map((user) => ({ user })),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      conv = await Conversation.findOne({ pairKey });
    }
  } else {
    const st = conv.stateFor(req.user._id);
    if (st && (st.deleted || st.archived)) {
      st.deleted = false;
      st.archived = false;
      await conv.save();
    }
  }
  res.status(201).json({ conversation: await describe(conv, req.user) });
});

export const messages = ah(async (req, res) => {
  const conv = await loadMine(req);
  const { before, limit } = req.valid.query;
  const st = conv.stateFor(req.user._id);
  const range = {};
  if (st?.clearedAt) range.$gt = st.clearedAt;
  if (before) range.$lt = new Date(before);
  const filter = { conversation: conv._id };
  if (Object.keys(range).length) filter.createdAt = range;

  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse();
  res.json({ messages: page.map(toMessage), hasMore });
});

export const send = ah(async (req, res) => {
  const conv = await loadMine(req);
  const body = req.valid.body;
  const peerId = otherParticipant(conv, req.user._id);
  const peer = await User.findById(peerId).select(PEER_FIELDS);
  if (!peer) throw new HttpError(404, 'RECIPIENT NOT FOUND', 'NOT_FOUND');
  if (!(await areContacts(req.user._id, peerId))) {
    throw new HttpError(403, 'YOU CAN ONLY MESSAGE ACCEPTED CONTACTS', 'NOT_CONTACTS');
  }
  // The client encrypted to specific public keys; make sure those are still the current ones.
  if (body.senderFp !== req.user.keyFingerprint) {
    throw new HttpError(409, 'YOUR KEY CHANGED - RELOAD', 'SENDER_KEY_MISMATCH');
  }
  if (body.recipientFp !== peer.keyFingerprint) {
    throw new HttpError(409, 'RECIPIENT KEY CHANGED - RE-ENCRYPT REQUIRED', 'RECIPIENT_KEY_CHANGED', {
      peer: toPeer(peer),
    });
  }

  const delivered = isOnline(peerId);
  const now = new Date();
  const msg = await Message.create({
    conversation: conv._id,
    sender: req.user._id,
    recipient: peerId,
    ciphertext: body.ciphertext,
    iv: body.iv,
    salt: body.salt,
    alg: body.alg,
    senderFp: body.senderFp,
    recipientFp: body.recipientFp,
    status: delivered ? 'delivered' : 'sent',
    deliveredAt: delivered ? now : null,
    createdAt: now,
  });

  // A new message resurfaces a deleted/archived conversation for both people.
  conv.lastMessageAt = now;
  conv.state.forEach((s) => {
    s.deleted = false;
    s.archived = false;
  });
  await conv.save();

  const payload = { message: toMessage(msg) };
  emitToUser(peerId, 'message:new', payload);
  emitToUser(req.user._id, 'message:new', payload); // other devices of the sender
  await logEvent(req.user._id, 'MESSAGE_TRANSMITTED', 'ENCRYPTED MESSAGE TRANSMITTED');
  res.status(201).json(payload);
});

export const markRead = ah(async (req, res) => {
  const conv = await loadMine(req);
  const unread = await Message.find({ conversation: conv._id, recipient: req.user._id, status: { $ne: 'read' } }).select('_id');
  const ids = unread.map((m) => m._id);
  if (ids.length) {
    await Message.updateMany({ _id: { $in: ids } }, { $set: { status: 'read', readAt: new Date() } });
    const peerId = otherParticipant(conv, req.user._id);
    emitToUser(peerId, 'message:status', { conversationId: String(conv._id), ids: ids.map(String), status: 'read' });
  }
  emitToUser(req.user._id, 'conversation:update', { conversationId: String(conv._id), reason: 'read' });
  res.json({ ok: true, count: ids.length });
});

export const setArchived = ah(async (req, res) => {
  const conv = await loadMine(req);
  const st = conv.stateFor(req.user._id);
  st.archived = req.valid.body.archived;
  await conv.save();
  emitToUser(req.user._id, 'conversation:update', { conversationId: String(conv._id), reason: 'archive' });
  res.json({ ok: true });
});

// "Delete" removes the conversation from MY view and hides its history for me only.
export const remove = ah(async (req, res) => {
  const conv = await loadMine(req);
  const st = conv.stateFor(req.user._id);
  st.deleted = true;
  st.archived = false;
  st.clearedAt = new Date();
  await conv.save();
  emitToUser(req.user._id, 'conversation:update', { conversationId: String(conv._id), reason: 'delete' });
  res.json({ ok: true });
});
