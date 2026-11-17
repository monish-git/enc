import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim (keyManager persists the wrapped private key there).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { b64decode, b64encode, checkSupport, enc, fingerprintOf } = await import('../src/services/crypto.js');
const km = await import('../src/services/keyManager.js');
const { ALG, decryptMessage, encryptPayload, describeCiphertext } = await import('../src/services/encryption.js');

const PW_A = 'alice-correct-horse-battery';
const PW_B = 'bob-staple-orbit-lantern-9';
const CONV = '64b000000000000000000001';

async function makeUser(id, username, password) {
  const { publicKey, fingerprint, blob } = await km.createIdentity(password);
  await km.installIdentity(id, blob, password);
  km.lock();
  return { id, username, publicKey, keyFingerprint: fingerprint, password };
}

let alice, bob, eve;

test('environment supports X25519 / HKDF / AES-GCM', async () => {
  const s = await checkSupport();
  assert.equal(s.ok, true, s.reason);
});

test('key generation: 32-byte public key, 64-hex fingerprint, wrapped private key stored locally', async () => {
  alice = await makeUser('a1', 'alice', PW_A);
  bob = await makeUser('b1', 'bob', PW_B);
  eve = await makeUser('e1', 'eve', 'eve-has-a-long-password-1');
  assert.equal(b64decode(alice.publicKey).length, 32);
  assert.match(alice.keyFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(alice.keyFingerprint, await fingerprintOf(b64decode(alice.publicKey)));
  const stored = km.getStoredBlob('a1');
  assert.ok(stored.data && stored.iv && stored.kdf.salt);
  // the stored blob must not contain a readable PKCS#8 private key
  assert.ok(!JSON.stringify(stored).includes('MC4CAQAwBQYDK2Vu')); // PKCS#8 X25519 header in base64
});

test('wrong password cannot unlock, right password can; lock() drops the key', async () => {
  await assert.rejects(() => km.unlock('a1', 'not-the-password'), { code: 'BAD_PASSWORD' });
  assert.equal(km.isUnlocked('a1'), false);
  await km.unlock('a1', PW_A);
  assert.equal(km.isUnlocked('a1'), true);
  km.lock();
  assert.equal(km.isUnlocked('a1'), false);
  await assert.rejects(() => km.sharedBase(bob.publicKey), { code: 'LOCKED' });
});

async function send(from, to, payload, convId = CONV) {
  await km.unlock(from.id, from.password);
  const out = await encryptPayload({ payload, conversationId: convId, me: from, peer: to });
  km.lock();
  return {
    id: 'm' + Math.random().toString(36).slice(2),
    conversationId: convId,
    senderId: from.id,
    recipientId: to.id,
    ...out,
  };
}

test('end-to-end: Alice -> Bob, Bob decrypts the exact plaintext; Alice can decrypt her own sent copy', async () => {
  const text = 'Hey! Are we meeting tomorrow at 10 AM? ✓ ünïcödé 🔐';
  const msg = await send(alice, bob, { text });

  // what the server would store: base64 ciphertext, no plaintext anywhere
  const raw = b64decode(msg.ciphertext);
  assert.ok(!Buffer.from(raw).includes(Buffer.from(text)), 'plaintext leaked into ciphertext');
  assert.ok(!JSON.stringify(msg).includes('meeting'), 'plaintext leaked into the stored record');
  assert.equal(msg.alg, ALG);
  assert.equal(b64decode(msg.iv).length, 12);
  assert.equal(b64decode(msg.salt).length, 16);

  await km.unlock(bob.id, bob.password);
  const got = await decryptMessage({ message: msg, me: bob, peer: alice });
  assert.equal(got.text, text);
  km.lock();

  await km.unlock(alice.id, alice.password);
  const mine = await decryptMessage({ message: msg, me: alice, peer: bob });
  assert.equal(mine.text, text);
  km.lock();
});

test('attachments round-trip inside the encrypted envelope', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(50_000));
  const file = { name: 'secret.bin', type: 'application/octet-stream', size: bytes.length, data: b64encode(bytes) };
  const msg = await send(bob, alice, { text: 'file attached', file });
  assert.ok(!msg.ciphertext.includes('secret.bin'));
  await km.unlock(alice.id, alice.password);
  const got = await decryptMessage({ message: msg, me: alice, peer: bob });
  km.lock();
  assert.equal(got.file.name, 'secret.bin');
  assert.deepEqual(b64decode(got.file.data), bytes);
});

test('every message gets a unique IV and a unique HKDF salt; same plaintext -> different ciphertext', async () => {
  await km.unlock(alice.id, alice.password);
  const ivs = new Set();
  const salts = new Set();
  const cts = new Set();
  for (let i = 0; i < 200; i++) {
    const out = await encryptPayload({ payload: { text: 'same text' }, conversationId: CONV, me: alice, peer: bob });
    ivs.add(out.iv);
    salts.add(out.salt);
    cts.add(out.ciphertext);
  }
  km.lock();
  assert.equal(ivs.size, 200);
  assert.equal(salts.size, 200);
  assert.equal(cts.size, 200);
});

test('tampering is detected (GCM authentication): ciphertext, tag, iv, salt', async () => {
  const msg = await send(alice, bob, { text: 'do not touch' });
  await km.unlock(bob.id, bob.password);
  const tryIt = (m) => decryptMessage({ message: m, me: bob, peer: alice });

  const flip = (b64, idx) => {
    const u = b64decode(b64);
    u[idx] ^= 0x01;
    return b64encode(u);
  };
  const ctLen = b64decode(msg.ciphertext).length;
  await assert.rejects(() => tryIt({ ...msg, ciphertext: flip(msg.ciphertext, 0) }), { code: 'AUTH_FAILED' });
  await assert.rejects(() => tryIt({ ...msg, ciphertext: flip(msg.ciphertext, ctLen - 1) }), { code: 'AUTH_FAILED' }); // tag byte
  await assert.rejects(() => tryIt({ ...msg, iv: flip(msg.iv, 3) }), { code: 'AUTH_FAILED' });
  await assert.rejects(() => tryIt({ ...msg, salt: flip(msg.salt, 3) }), { code: 'AUTH_FAILED' });
  // truncated ciphertext
  await assert.rejects(() => tryIt({ ...msg, ciphertext: b64encode(b64decode(msg.ciphertext).slice(0, ctLen - 1)) }), { code: 'AUTH_FAILED' });
  // untouched still decrypts
  assert.equal((await tryIt(msg)).text, 'do not touch');
  km.lock();
});

test('metadata is authenticated: moving a message to another conversation / sender fails', async () => {
  const msg = await send(alice, bob, { text: 'bound to metadata' });
  await km.unlock(bob.id, bob.password);
  await assert.rejects(
    () => decryptMessage({ message: { ...msg, conversationId: '64b000000000000000000999' }, me: bob, peer: alice }),
    { code: 'AUTH_FAILED' }
  );
  km.lock();
});

test('a third party cannot read the message even if they spoof fingerprint checks', async () => {
  const msg = await send(alice, bob, { text: 'for bob only' });
  await km.unlock(eve.id, eve.password);
  // Eve pretends to be Bob (same id + fingerprint) but only holds her own private key.
  const fakeBob = { id: bob.id, keyFingerprint: bob.keyFingerprint };
  await assert.rejects(() => decryptMessage({ message: msg, me: fakeBob, peer: alice }), { code: 'AUTH_FAILED' });
  // and with her honest identity the fingerprint check rejects it earlier
  await assert.rejects(() => decryptMessage({ message: msg, me: eve, peer: alice }), { code: 'KEY_MISMATCH' });
  km.lock();
});

test('peer public key that does not match its fingerprint is refused (malicious server)', async () => {
  await km.unlock(alice.id, alice.password);
  const evilPeer = { ...bob, publicKey: eve.publicKey }; // server swaps in Eve's key, keeps Bob's fingerprint
  await assert.rejects(
    () => encryptPayload({ payload: { text: 'x' }, conversationId: CONV, me: alice, peer: evilPeer }),
    { code: 'KEY_INCONSISTENT' }
  );
  km.lock();
});

test('encryption details expose only public parameters', async () => {
  const msg = await send(alice, bob, { text: 'hi' });
  const d = describeCiphertext(msg);
  assert.equal(d.algorithm, 'AES-256-GCM');
  assert.equal(d.tagBits, 128);
  assert.equal(b64decode(d.authTagBase64).length, 16);
});

test('key backup export/import and password re-wrap', async () => {
  const backup = km.exportBackup('a1');
  assert.ok(JSON.parse(backup).blob.data);
  // simulate a new device
  const saved = km.getStoredBlob('a1');
  km.forgetLocalKey('a1');
  assert.equal(km.hasLocalKey('a1'), false);
  await assert.rejects(() => km.importBackup('a1', backup, 'wrong-password-here', alice.publicKey), { code: 'BAD_PASSWORD' });
  await assert.rejects(() => km.importBackup('a1', backup, PW_A, bob.publicKey), { code: 'WRONG_ACCOUNT' });
  await assert.rejects(() => km.importBackup('a1', '{not json', PW_A, alice.publicKey), { code: 'BAD_FILE' });
  await km.importBackup('a1', backup, PW_A, alice.publicKey);
  assert.equal(km.isUnlocked('a1'), true);
  km.lock();

  // password change: re-wrap under the new password
  assert.equal(await km.rewrap('a1', PW_A, 'a-brand-new-password-2'), true);
  await assert.rejects(() => km.unlock('a1', PW_A), { code: 'BAD_PASSWORD' });
  await km.unlock('a1', 'a-brand-new-password-2');
  km.lock();
  assert.notEqual(km.getStoredBlob('a1').data, saved.data);
});

test('a wrapped key is bound to its public key (AAD): swapping the public key breaks unwrap', async () => {
  const blob = km.getStoredBlob('b1');
  const { unwrapPrivateKey } = await import('../src/services/crypto.js');
  await assert.rejects(() => unwrapPrivateKey(blob, PW_B, eve.publicKey), { code: 'BAD_PASSWORD' });
});

test('TOFU pins are stored per user and peer', () => {
  assert.equal(km.getPin('a1', 'b1'), null);
  km.setPin('a1', 'b1', bob.keyFingerprint);
  assert.equal(km.getPin('a1', 'b1').fingerprint, bob.keyFingerprint);
  assert.equal(km.getPin('a1', 'e1'), null);
});
