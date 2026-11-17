import { Contact, pairKeyOf } from '../models/Contact.js';

// Small TTL cache of accepted-contact ids per user, used by presence + typing indicators.
const cache = new Map(); // userId -> { ids:Set<string>, at:number }
const TTL = 30_000;

export async function getContactIds(userId) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.ids;
  const docs = await Contact.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient');
  const ids = new Set(docs.map((d) => String(d.requester) === key ? String(d.recipient) : String(d.requester)));
  cache.set(key, { ids, at: Date.now() });
  return ids;
}

export function invalidateContacts(...userIds) {
  for (const id of userIds) cache.delete(String(id));
}

export async function areContacts(a, b) {
  const doc = await Contact.findOne({ pairKey: pairKeyOf(a, b), status: 'accepted' }).select('_id');
  return !!doc;
}
