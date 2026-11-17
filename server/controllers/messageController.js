import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { HttpError, ah } from '../utils/errors.js';
import { toMessage, toPeer } from '../services/serializers.js';
import { logEvent } from '../services/events.js';

// Messages I sent, across all conversations (ciphertext only).
export const sent = ah(async (req, res) => {
  const { before, limit } = req.valid.query;
  const convs = await Conversation.find({ participants: req.user._id });
  const cleared = new Map(convs.map((c) => [String(c._id), c.stateFor(req.user._id)?.clearedAt || null]));

  const filter = { sender: req.user._id };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = docs.length > limit;
  const visible = docs
    .slice(0, limit)
    .filter((m) => {
      const c = cleared.get(String(m.conversation));
      return !c || m.createdAt > c;
    });

  const peerIds = [...new Set(visible.map((m) => String(m.recipient)))];
  const peers = await User.find({ _id: { $in: peerIds } }).select('username statusMessage publicKey keyFingerprint lastSeen');
  res.json({
    messages: visible.map(toMessage),
    peers: Object.fromEntries(peers.map((p) => [String(p._id), toPeer(p)])),
    hasMore,
  });
});

export const report = ah(async (req, res) => {
  const msg = await Message.findById(req.params.id);
  // Only the recipient of a message can report it.
  if (!msg || String(msg.recipient) !== String(req.user._id)) {
    throw new HttpError(404, 'MESSAGE NOT FOUND', 'NOT_FOUND');
  }
  const { reason, details } = req.valid.body;
  try {
    await Report.create({ message: msg._id, reporter: req.user._id, reportedUser: msg.sender, reason, details });
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'YOU ALREADY REPORTED THIS MESSAGE', 'DUPLICATE');
    throw err;
  }
  await logEvent(req.user._id, 'MESSAGE_REPORTED', 'A MESSAGE WAS REPORTED (NO CONTENT SHARED)');
  res.status(201).json({ ok: true });
});
