// Key management: where the private key lives and how it is locked/unlocked.
//
//  * The private key is stored ONLY in this browser (localStorage), encrypted with a key derived
//    from the user's password. It is never sent to the server.
//  * "Unlocked" means a NON-extractable CryptoKey is held in memory. Locking drops it.
//  * Peer fingerprints are pinned on first use (TOFU) so a swapped server-side key is detected.
import {
  CryptoError,
  b64decode,
  b64encode,
  fingerprintOf,
  generateIdentity,
  importPrivateKey,
  sharedSecretBase,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './crypto.js';

const KEY_PREFIX = 'ecn.key.';
const PIN_PREFIX = 'ecn.pins.';

const store = () => globalThis.localStorage;

let unlocked = null; // { userId, privateKey, publicKeyB64, fingerprint }
const baseCache = new Map(); // peerPublicB64 -> CryptoKey (HKDF base)
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- local blob storage ----
export function getStoredBlob(userId) {
  try {
    const raw = store().getItem(KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const hasLocalKey = (userId) => !!getStoredBlob(userId);

function saveBlob(userId, blob) {
  store().setItem(KEY_PREFIX + userId, JSON.stringify(blob));
}

// ---- lifecycle ----
export const isUnlocked = (userId) => !!unlocked && (!userId || unlocked.userId === userId);
export const currentFingerprint = () => unlocked?.fingerprint || null;

export function lock() {
  if (!unlocked) return;
  unlocked = null;
  baseCache.clear();
  emit();
}

// Generate a brand new identity (used at registration and "reset keys").
// Returns what the server needs plus a wrapped blob that is stored once the user id is known.
export async function createIdentity(password) {
  const { publicRaw, pkcs8 } = await generateIdentity();
  const publicKey = b64encode(publicRaw);
  const fingerprint = await fingerprintOf(publicRaw);
  const wrapped = await wrapPrivateKey(pkcs8, password, publicKey);
  pkcs8.fill(0);
  const blob = { ...wrapped, publicKey, fingerprint, createdAt: new Date().toISOString() };
  return { publicKey, fingerprint, blob };
}

export async function installIdentity(userId, blob, password) {
  saveBlob(userId, blob);
  await unlock(userId, password);
}

export async function unlock(userId, password) {
  const blob = getStoredBlob(userId);
  if (!blob) throw new CryptoError('NO_LOCAL_KEY', 'NO KEY FOUND ON THIS DEVICE');
  const pkcs8 = await unwrapPrivateKey(blob, password, blob.publicKey);
  const privateKey = await importPrivateKey(pkcs8);
  pkcs8.fill(0);
  const fingerprint = await fingerprintOf(b64decode(blob.publicKey));
  baseCache.clear();
  unlocked = { userId, privateKey, publicKeyB64: blob.publicKey, fingerprint };
  emit();
}

// Re-authenticates the user locally: true only if `password` really opens the stored private key.
export async function verifyPassword(userId, password) {
  const blob = getStoredBlob(userId);
  if (!blob) return false;
  try {
    const pkcs8 = await unwrapPrivateKey(blob, password, blob.publicKey);
    pkcs8.fill(0);
    return true;
  } catch {
    return false;
  }
}

export function localPublicKey(userId) {
  return getStoredBlob(userId)?.publicKey || null;
}

// ---- shared secret with a peer (cached while unlocked) ----
export async function sharedBase(peerPublicB64) {
  if (!unlocked) throw new CryptoError('LOCKED', 'KEYS ARE LOCKED');
  let base = baseCache.get(peerPublicB64);
  if (!base) {
    base = await sharedSecretBase(unlocked.privateKey, b64decode(peerPublicB64));
    baseCache.set(peerPublicB64, base);
  }
  return base;
}

// ---- backup / restore ----
export function exportBackup(userId) {
  const blob = getStoredBlob(userId);
  if (!blob) throw new CryptoError('NO_LOCAL_KEY', 'NO KEY FOUND ON THIS DEVICE');
  return JSON.stringify({ format: 'ECN-KEY-BACKUP', version: 1, userId, exportedAt: new Date().toISOString(), blob }, null, 2);
}

// Verifies the file really belongs to this account (public key must match) and the password opens it.
export async function importBackup(userId, jsonText, password, expectedPublicKeyB64) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new CryptoError('BAD_FILE', 'NOT A VALID ECN KEY BACKUP');
  }
  const blob = parsed?.blob;
  if (parsed?.format !== 'ECN-KEY-BACKUP' || !blob?.publicKey) throw new CryptoError('BAD_FILE', 'NOT A VALID ECN KEY BACKUP');
  if (blob.publicKey !== expectedPublicKeyB64) {
    throw new CryptoError('WRONG_ACCOUNT', 'THIS BACKUP BELONGS TO A DIFFERENT KEY / ACCOUNT');
  }
  const pkcs8 = await unwrapPrivateKey(blob, password, blob.publicKey);
  pkcs8.fill(0);
  saveBlob(userId, blob);
  await unlock(userId, password);
}

// Re-encrypt the stored private key under a new password (after a password change).
export async function rewrap(userId, oldPassword, newPassword) {
  const blob = getStoredBlob(userId);
  if (!blob) return false;
  const pkcs8 = await unwrapPrivateKey(blob, oldPassword, blob.publicKey);
  const wrapped = await wrapPrivateKey(pkcs8, newPassword, blob.publicKey);
  pkcs8.fill(0);
  saveBlob(userId, { ...blob, ...wrapped });
  return true;
}

export function forgetLocalKey(userId) {
  store().removeItem(KEY_PREFIX + userId);
  if (unlocked?.userId === userId) lock();
}

// ---- trust-on-first-use pins for peers ----
const readPins = (myId) => {
  try {
    return JSON.parse(store().getItem(PIN_PREFIX + myId) || '{}');
  } catch {
    return {};
  }
};

export const getPin = (myId, peerId) => readPins(myId)[peerId] || null;

export function setPin(myId, peerId, fingerprint) {
  const pins = readPins(myId);
  pins[peerId] = { fingerprint, at: new Date().toISOString() };
  store().setItem(PIN_PREFIX + myId, JSON.stringify(pins));
}
