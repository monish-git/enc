import { isOnline } from './presence.js';

const id = (v) => String(v?._id ?? v);

export const toSelf = (u) => ({
  id: id(u),
  username: u.username,
  email: u.email,
  statusMessage: u.statusMessage || '',
  publicKey: u.publicKey,
  keyFingerprint: u.keyFingerprint,
  keyUpdatedAt: u.keyUpdatedAt,
  settings: {
    theme: u.settings?.theme ?? 'win95',
    crt: !!u.settings?.crt,
    scanlines: u.settings?.scanlines ?? true,
    sound: !!u.settings?.sound,
    previewBeforeSend: u.settings?.previewBeforeSend ?? true,
    autoLockMinutes: u.settings?.autoLockMinutes ?? 15,
    requirePasswordToDecrypt: !!u.settings?.requirePasswordToDecrypt,
  },
  createdAt: u.createdAt,
});

// What another user may see about a contact (includes the public key needed for E2E encryption).
export const toPeer = (u) => ({
  id: id(u),
  username: u.username,
  statusMessage: u.statusMessage || '',
  publicKey: u.publicKey,
  keyFingerprint: u.keyFingerprint,
  online: isOnline(id(u)),
  lastSeen: u.lastSeen || null,
});

// Search results for non-contacts: no key material, no presence.
export const toStranger = (u) => ({
  id: id(u),
  username: u.username,
  statusMessage: u.statusMessage || '',
});

export const toMessage = (m) => ({
  id: id(m),
  conversationId: String(m.conversation),
  senderId: String(m.sender),
  recipientId: String(m.recipient),
  ciphertext: m.ciphertext,
  iv: m.iv,
  salt: m.salt,
  alg: m.alg,
  senderFp: m.senderFp,
  recipientFp: m.recipientFp,
  status: m.status,
  createdAt: m.createdAt,
  deliveredAt: m.deliveredAt,
  readAt: m.readAt,
});
