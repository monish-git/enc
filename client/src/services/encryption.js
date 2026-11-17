// Message-level encryption built on crypto.js + keyManager.js.
//
//   shared   = X25519(myPrivate, peerPublic)                      (symmetric: both parties get the same)
//   msgKey   = HKDF-SHA256(shared, salt = random16, info = "ECN1|key|sender|recipient|senderFp|recipientFp")
//   cipher   = AES-256-GCM(msgKey, iv = random12, plaintext, AAD = "ECN1|conv|sender|recipient|fps")
//
// The sender can therefore decrypt their own sent messages, and any change to the metadata that is
// bound into the AAD (conversation, participants, key fingerprints) makes authentication fail.
import {
  CryptoError,
  aesGcmDecrypt,
  aesGcmEncrypt,
  b64decode,
  b64encode,
  dec,
  deriveMessageKey,
  enc,
  fingerprintOf,
  randomBytes,
} from './crypto.js';
import { sharedBase } from './keyManager.js';

export const ALG = 'ECN1-X25519-HKDF256-AES256GCM';
export const MAX_FILE_BYTES = 700 * 1024;

const aadOf = (m) => `ECN1|conv|${m.conversationId}|${m.senderId}|${m.recipientId}|${m.senderFp}|${m.recipientFp}`;
const infoOf = (m) => `ECN1|key|${m.senderId}|${m.recipientId}|${m.senderFp}|${m.recipientFp}`;

const noop = () => {};

/**
 * Encrypt a payload ({ text, file? }) for `peer`.
 * Returns exactly what is sent to the server: ciphertext + public parameters only.
 */
export async function encryptPayload({ payload, conversationId, me, peer, onStep = noop }) {
  const meta = {
    conversationId,
    senderId: me.id,
    recipientId: peer.id,
    senderFp: me.keyFingerprint,
    recipientFp: peer.keyFingerprint,
  };
  // Do not trust the fingerprint field blindly: it must match the key we are about to encrypt to.
  const peerFp = await fingerprintOf(b64decode(peer.publicKey));
  if (peerFp !== peer.keyFingerprint) {
    throw new CryptoError('KEY_INCONSISTENT', 'SERVER SENT A PUBLIC KEY THAT DOES NOT MATCH ITS FINGERPRINT');
  }

  const base = await sharedBase(peer.publicKey);
  onStep('ECDH');
  const salt = randomBytes(16);
  const iv = randomBytes(12); // fresh random 96-bit IV for every message
  const key = await deriveMessageKey(base, salt, infoOf(meta));
  onStep('HKDF');
  const plaintext = enc.encode(JSON.stringify({ v: 1, text: payload.text || '', file: payload.file || null }));
  const sealed = await aesGcmEncrypt(key, iv, plaintext, aadOf(meta));
  onStep('GCM');

  return {
    ciphertext: b64encode(sealed),
    iv: b64encode(iv),
    salt: b64encode(salt),
    alg: ALG,
    senderFp: meta.senderFp,
    recipientFp: meta.recipientFp,
  };
}

/**
 * Decrypt a stored message. `peer` is the OTHER participant's public identity (sender for received
 * messages, recipient for sent ones).
 */
export async function decryptMessage({ message, me, peer, onStep = noop }) {
  if (message.alg !== ALG) throw new CryptoError('BAD_ALG', `UNSUPPORTED ALGORITHM: ${message.alg}`);
  const mine = message.senderId === me.id;
  const myFpInMsg = mine ? message.senderFp : message.recipientFp;
  const peerFpInMsg = mine ? message.recipientFp : message.senderFp;

  if (me.keyFingerprint !== myFpInMsg) {
    throw new CryptoError('KEY_MISMATCH', 'THIS MESSAGE WAS ENCRYPTED FOR A PREVIOUS KEY OF YOURS (KEYS WERE RESET)');
  }
  const peerFp = await fingerprintOf(b64decode(peer.publicKey));
  if (peerFp !== peerFpInMsg) {
    throw new CryptoError('KEY_MISMATCH', "THIS MESSAGE WAS ENCRYPTED FOR A PREVIOUS KEY OF THE OTHER PARTY");
  }

  const base = await sharedBase(peer.publicKey);
  onStep('ECDH');
  const key = await deriveMessageKey(base, b64decode(message.salt), infoOf(message));
  onStep('HKDF');
  const plaintext = await aesGcmDecrypt(key, b64decode(message.iv), b64decode(message.ciphertext), aadOf(message));
  onStep('GCM');

  let payload;
  try {
    payload = JSON.parse(dec.decode(plaintext));
  } catch {
    throw new CryptoError('BAD_PAYLOAD', 'DECRYPTED DATA IS NOT A VALID ECN PAYLOAD');
  }
  if (payload?.v !== 1 || typeof payload.text !== 'string') throw new CryptoError('BAD_PAYLOAD', 'UNSUPPORTED PAYLOAD VERSION');
  return { text: payload.text, file: payload.file || null };
}

// Technical facts for the "View Encryption Details" dialog (nothing secret).
export function describeCiphertext(message) {
  const ct = b64decode(message.ciphertext);
  return {
    algorithm: 'AES-256-GCM',
    keyAgreement: 'X25519 (ECDH)',
    kdf: 'HKDF-SHA-256 (per-message salt)',
    ivBase64: message.iv,
    saltBase64: message.salt,
    authTagBase64: b64encode(ct.slice(ct.length - 16)),
    ciphertextBytes: ct.length - 16,
    tagBits: 128,
    senderFp: message.senderFp,
    recipientFp: message.recipientFp,
  };
}
