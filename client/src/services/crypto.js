// Low-level cryptographic primitives (Web Crypto API only - no third-party crypto, no Base64 "encryption").
//
//  Identity key ...... X25519 key pair, generated in the browser. The private key never leaves it.
//  Key agreement ..... X25519 ECDH(my private, peer public) -> 32-byte shared secret
//  Key derivation .... HKDF-SHA-256(secret, salt = random 16 bytes per message, info = context)
//  Message cipher .... AES-256-GCM, random 96-bit IV per message, 128-bit auth tag, AAD binds metadata
//  Key at rest ....... private key wrapped with AES-256-GCM under a PBKDF2-SHA-256 (600k) password key

const subtle = globalThis.crypto?.subtle;
export const enc = new TextEncoder();
export const dec = new TextDecoder();

export class CryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- encoding helpers (binary <-> text transport only; NOT encryption) ----------
export function b64encode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  return btoa(s);
}

export function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

// ---------- capability check ----------
export async function checkSupport() {
  try {
    if (!globalThis.isSecureContext && globalThis.isSecureContext !== undefined) {
      return { ok: false, reason: 'INSECURE CONTEXT - HTTPS REQUIRED' };
    }
    if (!subtle) return { ok: false, reason: 'WEB CRYPTO API UNAVAILABLE' };
    const kp = await subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    if (!kp?.privateKey) throw new Error('no key');
    return { ok: true, reason: 'WEBCRYPTO X25519 / HKDF / AES-GCM OK' };
  } catch {
    return { ok: false, reason: 'BROWSER LACKS X25519 SUPPORT - UPDATE YOUR BROWSER' };
  }
}

// ---------- identity keys ----------
export async function generateIdentity() {
  const kp = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey));
  return { publicRaw, pkcs8 };
}

// Imports the private key as NON-extractable: page scripts can use it but can no longer read it back.
export const importPrivateKey = (pkcs8) => subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);

export async function fingerprintOf(publicRaw) {
  return hex(await subtle.digest('SHA-256', publicRaw)); // 64 hex chars
}

export function formatFingerprint(fpHex, groups = 16) {
  return (fpHex || '')
    .toUpperCase()
    .slice(0, groups * 4)
    .match(/.{1,4}/g)
    ?.join(' ') || '';
}

// ---------- password-based wrapping of the private key ----------
const PBKDF2_ITER = 600_000;

async function passwordKey(password, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const wrapAad = (publicKeyB64) => enc.encode(`ECN1-KEYWRAP|${publicKeyB64}`);

export async function wrapPrivateKey(pkcs8, password, publicKeyB64, iterations = PBKDF2_ITER) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passwordKey(password, salt, iterations);
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: wrapAad(publicKeyB64) }, key, pkcs8));
  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iter: iterations, salt: b64encode(salt) },
    iv: b64encode(iv),
    data: b64encode(data),
  };
}

export async function unwrapPrivateKey(wrapped, password, publicKeyB64) {
  try {
    if (wrapped?.v !== 1 || wrapped.kdf?.name !== 'PBKDF2-SHA256') throw new Error('format');
    const iterations = Number(wrapped.kdf.iter);
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 5_000_000) throw new Error('iter');
    const key = await passwordKey(password, b64decode(wrapped.kdf.salt), iterations);
    const pkcs8 = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(wrapped.iv), additionalData: wrapAad(publicKeyB64) },
      key,
      b64decode(wrapped.data)
    );
    return new Uint8Array(pkcs8);
  } catch {
    throw new CryptoError('BAD_PASSWORD', 'WRONG PASSWORD OR CORRUPTED KEY FILE');
  }
}

// ---------- key agreement + derivation ----------
// Returns an HKDF "base key" built from the X25519 shared secret with `peerPublicRaw`.
export async function sharedSecretBase(privateKey, peerPublicRaw) {
  const peerPublic = await subtle.importKey('raw', peerPublicRaw, { name: 'X25519' }, false, []);
  let bits;
  try {
    bits = await subtle.deriveBits({ name: 'X25519', public: peerPublic }, privateKey, 256);
  } catch {
    throw new CryptoError('BAD_PEER_KEY', 'INVALID PEER PUBLIC KEY');
  }
  const base = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  new Uint8Array(bits).fill(0);
  return base;
}

export const deriveMessageKey = (hkdfBase, salt, info) =>
  subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
    hkdfBase,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

// ---------- AES-256-GCM ----------
export async function aesGcmEncrypt(key, iv, plaintext, aad) {
  return new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad), tagLength: 128 }, key, plaintext));
}

export async function aesGcmDecrypt(key, iv, ciphertext, aad) {
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad), tagLength: 128 }, key, ciphertext));
  } catch {
    throw new CryptoError('AUTH_FAILED', 'AUTHENTICATION TAG MISMATCH - MESSAGE TAMPERED OR WRONG KEY');
  }
}
