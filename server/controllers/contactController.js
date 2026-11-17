import { Contact, pairKeyOf } from '../models/Contact.js';
import { User } from '../models/User.js';
import { HttpError, ah } from '../utils/errors.js';
import { toPeer, toStranger } from '../services/serializers.js';
import { emitToUser } from '../services/realtime.js';
import { invalidateContacts } from '../services/contacts.js';
import { logEvent } from '../services/events.js';

const USER_FIELDS = 'username statusMessage publicKey keyFingerprint lastSeen';

export const list = ah(async (req, res) => {
  const me = String(req.user._id);
  const docs = await Contact.find({
    status: { $in: ['pending', 'accepted'] },
    $or: [{ requester: req.user._id }, { recipient: req.user._id }],
  })
    .populate('requester', USER_FIELDS)
    .populate('recipient', USER_FIELDS)
    .sort({ updatedAt: -1 });

  const contacts = [];
  const incoming = [];
  const outgoing = [];
  for (const d of docs) {
    if (!d.requester || !d.recipient) continue; // user deleted
    const iAmRequester = String(d.requester._id) === me;
    const other = iAmRequester ? d.recipient : d.requester;
    if (d.status === 'accepted') contacts.push({ id: String(d._id), user: toPeer(other), since: d.respondedAt || d.createdAt });
    else if (iAmRequester) outgoing.push({ id: String(d._id), user: toStranger(other), at: d.createdAt });
    else incoming.push({ id: String(d._id), user: toStranger(other), at: d.createdAt });
  }
  contacts.sort((a, b) => a.user.username.localeCompare(b.user.username));
  res.json({ contacts, incoming, outgoing });
});

export const request = ah(async (req, res) => {
  const { userId } = req.valid.body;
  if (userId === String(req.user._id)) throw new HttpError(400, 'YOU CANNOT ADD YOURSELF', 'VALIDATION');
  const target = await User.findById(userId).select('_id username');
  if (!target) throw new HttpError(404, 'USER NOT FOUND', 'NOT_FOUND');

  const pairKey = pairKeyOf(req.user._id, target._id);
  let doc = await Contact.findOne({ pairKey });
  let autoAccepted = false;

  if (!doc) {
    doc = await Contact.create({ requester: req.user._id, recipient: target._id, pairKey });
  } else if (doc.status === 'accepted') {
    throw new HttpError(409, 'ALREADY IN YOUR CONTACTS', 'DUPLICATE');
  } else if (doc.status === 'pending') {
    if (String(doc.requester) === String(req.user._id)) throw new HttpError(409, 'REQUEST ALREADY SENT', 'DUPLICATE');
    // They already asked us: accept straight away.
    doc.status = 'accepted';
    doc.respondedAt = new Date();
    await doc.save();
    autoAccepted = true;
  } else {
    // rejected: the person who was rejected must wait 7 days before asking again
    const waitMs = 7 * 24 * 3600 * 1000;
    if (String(doc.requester) === String(req.user._id) && doc.respondedAt && Date.now() - doc.respondedAt.getTime() < waitMs) {
      throw new HttpError(403, 'REQUEST WAS DECLINED RECENTLY', 'DECLINED');
    }
    doc.requester = req.user._id;
    doc.recipient = target._id;
    doc.status = 'pending';
    doc.respondedAt = null;
    await doc.save();
  }

  invalidateContacts(req.user._id, target._id);
  emitToUser(target._id, 'contacts:update', { reason: autoAccepted ? 'accepted' : 'request' });
  emitToUser(req.user._id, 'contacts:update', { reason: 'sent' });
  if (autoAccepted) await logEvent(req.user._id, 'CONTACT_ADDED', `CONTACT ADDED: ${target.username.toUpperCase()}`);
  res.status(201).json({ id: String(doc._id), status: doc.status });
});

async function loadForRecipient(req) {
  const doc = await Contact.findById(req.params.id);
  if (!doc || String(doc.recipient) !== String(req.user._id)) throw new HttpError(404, 'REQUEST NOT FOUND', 'NOT_FOUND');
  if (doc.status !== 'pending') throw new HttpError(409, 'REQUEST ALREADY HANDLED', 'DUPLICATE');
  return doc;
}

export const accept = ah(async (req, res) => {
  const doc = await loadForRecipient(req);
  doc.status = 'accepted';
  doc.respondedAt = new Date();
  await doc.save();
  invalidateContacts(doc.requester, doc.recipient);
  emitToUser(doc.requester, 'contacts:update', { reason: 'accepted' });
  emitToUser(doc.recipient, 'contacts:update', { reason: 'accepted' });
  res.json({ ok: true });
});

export const reject = ah(async (req, res) => {
  const doc = await loadForRecipient(req);
  doc.status = 'rejected';
  doc.respondedAt = new Date();
  await doc.save();
  invalidateContacts(doc.requester, doc.recipient);
  emitToUser(doc.recipient, 'contacts:update', { reason: 'rejected' });
  res.json({ ok: true });
});

// Remove a contact or cancel a request I sent.
export const remove = ah(async (req, res) => {
  const doc = await Contact.findById(req.params.id);
  const me = String(req.user._id);
  if (!doc || (String(doc.requester) !== me && String(doc.recipient) !== me)) {
    throw new HttpError(404, 'CONTACT NOT FOUND', 'NOT_FOUND');
  }
  await doc.deleteOne();
  invalidateContacts(doc.requester, doc.recipient);
  emitToUser(doc.requester, 'contacts:update', { reason: 'removed' });
  emitToUser(doc.recipient, 'contacts:update', { reason: 'removed' });
  res.json({ ok: true });
});
