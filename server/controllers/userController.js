import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Contact } from '../models/Contact.js';
import { HttpError, ah } from '../utils/errors.js';
import { verifyPassword } from '../services/passwords.js';
import { toSelf, toStranger } from '../services/serializers.js';
import { logEvent } from '../services/events.js';
import { emitToUser } from '../services/realtime.js';
import { getContactIds } from '../services/contacts.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const search = ah(async (req, res) => {
  const { q } = req.valid.query;
  const term = q.toLowerCase();
  // Prefix match on username only (email is never searchable, to avoid harvesting).
  const users = await User.find({
    username: new RegExp(`^${escapeRe(term)}`),
    _id: { $ne: req.user._id },
  })
    .select('username statusMessage')
    .sort({ username: 1 })
    .limit(10);

  const ids = users.map((u) => u._id);
  const rels = await Contact.find({
    $or: [
      { requester: req.user._id, recipient: { $in: ids } },
      { recipient: req.user._id, requester: { $in: ids } },
    ],
  });

  const results = users.map((u) => {
    const rel = rels.find((r) => String(r.requester) === String(u._id) || String(r.recipient) === String(u._id));
    let relation = 'none';
    if (rel?.status === 'accepted') relation = 'contact';
    else if (rel?.status === 'pending') relation = String(rel.requester) === String(req.user._id) ? 'pending_out' : 'pending_in';
    return { ...toStranger(u), relation };
  });
  res.json({ results });
});

export const updateSettings = ah(async (req, res) => {
  const patch = req.valid.body;
  const user = await User.findById(req.user._id);
  if (patch.statusMessage !== undefined) user.statusMessage = patch.statusMessage;
  for (const [k, v] of Object.entries(patch)) {
    if (k !== 'statusMessage') user.settings[k] = v;
  }
  await user.save();
  res.json({ user: toSelf(user) });
});

// Reset identity key (e.g. after losing the device). Old messages become undecryptable.
export const resetKey = ah(async (req, res) => {
  const { password, publicKey } = req.valid.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'PASSWORD IS INCORRECT', 'BAD_CREDENTIALS');
  }
  user.publicKey = publicKey;
  user.keyFingerprint = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex');
  user.keyUpdatedAt = new Date();
  await user.save();

  await logEvent(user._id, 'KEY_RESET', 'IDENTITY KEY PAIR REPLACED - OLD MESSAGES CAN NO LONGER BE DECRYPTED', 'alert');
  const contacts = await getContactIds(user._id);
  for (const cid of contacts) emitToUser(cid, 'contact:key-changed', { userId: String(user._id) });
  emitToUser(user._id, 'contact:key-changed', { userId: String(user._id) });
  res.json({ user: toSelf(user) });
});
