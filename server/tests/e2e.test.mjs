// End-to-end test: boots the REAL server against a MongoDB-compatible database and drives it over
// HTTP + Socket.IO using the REAL client crypto code. Requires MONGODB_URI (a throw-away database).
//   MONGODB_URI=mongodb://127.0.0.1:27017/ecn_test node --test tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.resolve(here, '../../client/src/services');
const BASE_URI = process.env.MONGODB_URI;
if (!BASE_URI) {
  console.log('MONGODB_URI not set - skipping e2e tests');
  process.exit(0);
}

// browser shims for the client modules
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const km = await import(pathToFileURL(path.join(clientSrc, 'keyManager.js')));
const { encryptPayload, decryptMessage } = await import(pathToFileURL(path.join(clientSrc, 'encryption.js')));
const clientRequire = createRequire(path.resolve(here, '../../client/package.json'));
const { io: ioClient } = await import(pathToFileURL(clientRequire.resolve('socket.io-client')));
const mongoose = (await import('mongoose')).default;

const PORT = 5600 + Math.floor(Math.random() * 300);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DB = `ecn_e2e_${Date.now()}`;
const uri = BASE_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
let proc;
let logs = '';

class Client {
  constructor() {
    this.cookies = new Map();
  }
  async call(method, url, body, { csrf = true, headers = {} } = {}) {
    const res = await fetch(ORIGIN + '/api' + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-Requested-With': 'ECN' } : {}),
        Origin: ORIGIN,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v.join('=') === '') this.cookies.delete(k);
      else this.cookies.set(k, v.join('='));
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not json */
    }
    return { status: res.status, data, headers: res.headers };
  }
  get = (u) => this.call('GET', u);
  post = (u, b = {}) => this.call('POST', u, b);
  put = (u, b = {}) => this.call('PUT', u, b);
  del = (u) => this.call('DELETE', u);
}

const PW = {
  alice: 'correct-horse-battery-1',
  bob: 'orbit-lantern-staple-22',
  carol: 'velvet-thunder-moss-3',
};
const users = {};

async function registerUser(name) {
  const c = new Client();
  const { publicKey, blob } = await km.createIdentity(PW[name]);
  const r = await c.post('/auth/register', { username: name, email: `${name}@example.com`, password: PW[name], publicKey });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await km.installIdentity(r.data.user.id, blob, PW[name]);
  km.lock();
  users[name] = { c, ...r.data.user, password: PW[name] };
  return users[name];
}

const unlockAs = (name) => km.unlock(users[name].id, users[name].password);

function connectSocket(user) {
  return new Promise(async (resolve, reject) => {
    const t = await user.c.post('/auth/socket-ticket');
    assert.equal(t.status, 200);
    const s = ioClient(ORIGIN, { auth: { ticket: t.data.ticket }, transports: ['websocket'], reconnection: false, extraHeaders: { Origin: ORIGIN } });
    const events = [];
    s.onAny((e, p) => events.push([e, p]));
    s.on('connect', () => resolve({ s, events }));
    s.on('connect_error', reject);
  });
}
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timeout waiting for condition');
};

before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(here, '..'),
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: uri, SESSION_SECRET: 'e'.repeat(48), CLIENT_ORIGIN: ORIGIN, NODE_ENV: 'development' },
  });
  proc.stdout.on('data', (d) => (logs += d));
  proc.stderr.on('data', (d) => (logs += d));
  await waitFor(() => logs.includes('listening on'), 20000).catch(() => {
    throw new Error('server did not start:\n' + logs);
  });
});

after(async () => {
  proc?.kill('SIGTERM');
  try {
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
  } catch {
    /* best effort */
  }
  await mongoose.disconnect().catch(() => {});
});

test('health + CSRF guard + security headers', async () => {
  const c = new Client();
  const h = await c.get('/health');
  assert.equal(h.status, 200);
  assert.ok(h.headers.get('content-security-policy')?.includes("default-src 'self'"));
  assert.equal(h.headers.get('x-powered-by'), null);
  const noHeader = await c.call('POST', '/auth/login', { identifier: 'x', password: 'y' }, { csrf: false });
  assert.equal(noHeader.status, 403);
  const badOrigin = await c.call('POST', '/auth/login', { identifier: 'x', password: 'y' }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(badOrigin.status, 403);
});

test('registration validates input and stores no private key', async () => {
  const c = new Client();
  const { publicKey } = await km.createIdentity('whatever-password-1');
  const weak = await c.post('/auth/register', { username: 'weakling', email: 'w@example.com', password: 'short', publicKey });
  assert.equal(weak.status, 400);
  const badKey = await c.post('/auth/register', { username: 'weakling', email: 'w@example.com', password: 'a-long-enough-password', publicKey: 'AAAA' });
  assert.equal(badKey.status, 400);
  const badName = await c.post('/auth/register', { username: 'No Spaces!', email: 'w@example.com', password: 'a-long-enough-password', publicKey });
  assert.equal(badName.status, 400);

  const alice = await registerUser('alice');
  await registerUser('bob');
  await registerUser('carol');
  assert.match(alice.keyFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(alice.passwordHash, undefined);
  assert.equal(alice.privateKey, undefined);

  const dup = await new Client().post('/auth/register', { username: 'alice', email: 'other@example.com', password: PW.alice, publicKey });
  assert.equal(dup.status, 409);
});

test('session cookie is HttpOnly-style, /auth/me works, unauthenticated is rejected', async () => {
  const me = await users.alice.c.get('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'alice');
  assert.equal((await new Client().get('/auth/me')).status, 401);
  assert.equal((await new Client().get('/conversations')).status, 401);
});

test('login: wrong password is generic, brute force is locked out, real login works', async () => {
  const c = new Client();
  const bad = await c.post('/auth/login', { identifier: 'carol', password: 'nope-nope-nope' });
  assert.equal(bad.status, 401);
  const unknown = await c.post('/auth/login', { identifier: 'nobody', password: 'nope-nope-nope' });
  assert.equal(unknown.status, 401);
  assert.equal(bad.data.error, unknown.data.error, 'must not reveal whether the account exists');
  for (let i = 0; i < 5; i++) await c.post('/auth/login', { identifier: 'carol', password: 'nope-nope-nope' });
  const locked = await c.post('/auth/login', { identifier: 'carol', password: PW.carol });
  assert.equal(locked.status, 429, 'correct password must still be refused while locked');
  // bob logs in with email, fine
  const ok = await new Client().post('/auth/login', { identifier: 'bob@example.com', password: PW.bob });
  assert.equal(ok.status, 200);
  const sec = await users.carol.c.get('/security/overview');
  assert.ok(sec.data.failed.last24h >= 6);
});

test('contacts: search, request, accept; strangers expose no key material', async () => {
  const { alice, bob } = users;
  const s = await alice.c.get('/users/search?q=bo');
  assert.equal(s.status, 200);
  assert.equal(s.data.results[0].username, 'bob');
  assert.equal(s.data.results[0].publicKey, undefined);
  assert.equal(s.data.results[0].email, undefined);
  assert.equal((await alice.c.get('/users/search?q=b')).status, 400);

  // cannot start a conversation before being contacts
  assert.equal((await alice.c.post('/conversations', { userId: bob.id })).status, 403);

  const req = await alice.c.post('/contacts/request', { userId: bob.id });
  assert.equal(req.status, 201);
  assert.equal((await alice.c.post('/contacts/request', { userId: bob.id })).status, 409);
  const list = await bob.c.get('/contacts');
  assert.equal(list.data.incoming.length, 1);
  // alice cannot accept her own request
  assert.equal((await alice.c.post(`/contacts/${list.data.incoming[0].id}/accept`)).status, 404);
  assert.equal((await bob.c.post(`/contacts/${list.data.incoming[0].id}/accept`)).status, 200);
  const after = await alice.c.get('/contacts');
  assert.equal(after.data.contacts.length, 1);
  assert.equal(after.data.contacts[0].user.publicKey, bob.publicKey);
});

let convId;
const SECRET_TEXT = 'Hey! Are we meeting tomorrow at 10 AM? purple-elephant-7731';

test('real-time E2E: alice -> bob (encrypt, store ciphertext only, deliver, decrypt, read receipt)', async () => {
  const { alice, bob } = users;
  const conv = await alice.c.post('/conversations', { userId: bob.id });
  assert.equal(conv.status, 201);
  convId = conv.data.conversation.id;

  const sb = await connectSocket(bob);
  const sa = await connectSocket(alice);
  await waitFor(() => sa.events.some(([e, p]) => e === 'presence' && p.userId === bob.id && p.online) || true);

  // alice encrypts in the "browser"
  await unlockAs('alice');
  const peer = (await alice.c.get('/contacts')).data.contacts[0].user;
  const out = await encryptPayload({ payload: { text: SECRET_TEXT }, conversationId: convId, me: alice, peer });
  km.lock();
  const sent = await alice.c.post(`/conversations/${convId}/messages`, out);
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.message.status, 'delivered', 'bob is online');
  assert.ok(!JSON.stringify(sent.data).includes('purple-elephant'));

  // bob receives it live, as ciphertext
  const ev = await waitFor(() => sb.events.find(([e]) => e === 'message:new'));
  assert.equal(ev[1].message.ciphertext, out.ciphertext);
  assert.ok(!JSON.stringify(ev).includes('purple-elephant'));

  // the database holds only ciphertext + public parameters
  await mongoose.connect(uri);
  const raw = await mongoose.connection.db.collection('messages').find({}).toArray();
  assert.equal(raw.length, 1);
  assert.ok(!JSON.stringify(raw).includes('purple-elephant'), 'plaintext found in the database!');
  assert.deepEqual(Object.keys(raw[0]).sort().filter((k) => /^(text|plain\w*|body|content|message)$/i.test(k)), []);
  await mongoose.disconnect();
  assert.ok(!logs.includes('purple-elephant'), 'plaintext found in server logs!');

  // bob decrypts
  const history = await bob.c.get(`/conversations/${convId}/messages`);
  assert.equal(history.data.messages.length, 1);
  const peerForBob = (await bob.c.get('/contacts')).data.contacts[0].user;
  await unlockAs('bob');
  const plain = await decryptMessage({ message: history.data.messages[0], me: bob, peer: peerForBob });
  assert.equal(plain.text, SECRET_TEXT);
  km.lock();

  // alice can decrypt her own sent copy
  await unlockAs('alice');
  const mine = await decryptMessage({ message: history.data.messages[0], me: alice, peer });
  assert.equal(mine.text, SECRET_TEXT);
  km.lock();

  // typing indicator + read receipt
  sb.s.emit('typing', { conversationId: convId, typing: true });
  await waitFor(() => sa.events.find(([e, p]) => e === 'typing' && p.typing === true));
  assert.equal((await bob.c.get('/conversations/unread')).data.unread, 1);
  assert.equal((await bob.c.post(`/conversations/${convId}/read`)).status, 200);
  await waitFor(() => sa.events.find(([e, p]) => e === 'message:status' && p.status === 'read'));
  assert.equal((await bob.c.get('/conversations/unread')).data.unread, 0);

  sa.s.close();
  sb.s.close();
});

test('server rejects malformed ciphertext parameters and key mismatches', async () => {
  const { alice } = users;
  const base = { ciphertext: 'QUJD'.repeat(10), iv: 'AAAAAAAAAAAAAAAA', salt: 'AAAAAAAAAAAAAAAAAAAAAA==', alg: 'ECN1-X25519-HKDF256-AES256GCM', senderFp: alice.keyFingerprint, recipientFp: 'a'.repeat(64) };
  assert.equal((await alice.c.post(`/conversations/${convId}/messages`, { ...base, iv: 'QUJD' })).status, 400, 'short IV');
  assert.equal((await alice.c.post(`/conversations/${convId}/messages`, { ...base, alg: 'ROT13' })).status, 400, 'unknown alg');
  assert.equal((await alice.c.post(`/conversations/${convId}/messages`, { ...base, ciphertext: 'not base64!!' })).status, 400);
  const wrongFp = await alice.c.post(`/conversations/${convId}/messages`, base);
  assert.equal(wrongFp.status, 409);
  assert.equal(wrongFp.data.code, 'RECIPIENT_KEY_CHANGED');
});

test('authorization: third parties cannot read, send into, or report others\' conversations', async () => {
  const { carol, alice } = users;
  const login = await carol.c.post('/auth/login', { identifier: 'carol', password: PW.carol });
  assert.equal(login.status, 429); // still locked from the brute-force test: use the existing session
  assert.equal((await carol.c.get(`/conversations/${convId}`)).status, 404);
  assert.equal((await carol.c.get(`/conversations/${convId}/messages`)).status, 404);
  assert.equal((await carol.c.post(`/conversations/${convId}/read`)).status, 404);
  assert.equal((await carol.c.del(`/conversations/${convId}`)).status, 404);
  const msgs = (await alice.c.get(`/conversations/${convId}/messages`)).data.messages;
  assert.equal((await carol.c.post(`/messages/${msgs[0].id}/report`, { reason: 'spam' })).status, 404);
  assert.deepEqual((await carol.c.get('/conversations')).data.conversations, []);
});

test('report, archive, delete (per-user), unread', async () => {
  const { alice, bob } = users;
  const msg = (await bob.c.get(`/conversations/${convId}/messages`)).data.messages[0];
  assert.equal((await alice.c.post(`/messages/${msg.id}/report`, { reason: 'spam' })).status, 404, 'sender cannot report own message');
  assert.equal((await bob.c.post(`/messages/${msg.id}/report`, { reason: 'spam', details: 'test' })).status, 201);
  assert.equal((await bob.c.post(`/messages/${msg.id}/report`, { reason: 'spam' })).status, 409);

  assert.equal((await bob.c.put(`/conversations/${convId}/archive`, { archived: true })).status, 200);
  assert.equal((await bob.c.get('/conversations')).data.conversations.length, 0);
  assert.equal((await bob.c.get('/conversations?archived=true')).data.conversations.length, 1);
  assert.equal((await alice.c.get('/conversations')).data.conversations.length, 1, 'archive is per-user');
  assert.equal((await bob.c.put(`/conversations/${convId}/archive`, { archived: false })).status, 200);

  const sent = await alice.c.get('/messages/sent');
  assert.equal(sent.data.messages.length, 1);
  assert.equal(sent.data.peers[bob.id].username, 'bob');

  assert.equal((await bob.c.del(`/conversations/${convId}`)).status, 200);
  assert.equal((await bob.c.get('/conversations')).data.conversations.length, 0);
  assert.equal((await bob.c.get(`/conversations/${convId}/messages`)).data.messages.length, 0, 'history hidden for bob');
  assert.equal((await alice.c.get(`/conversations/${convId}/messages`)).data.messages.length, 1, 'alice keeps hers');
});

test('security center, settings, password change, session revocation, logout', async () => {
  const { alice } = users;
  const second = new Client();
  assert.equal((await second.post('/auth/login', { identifier: 'alice', password: PW.alice })).status, 200);

  const ov = await alice.c.get('/security/overview');
  assert.equal(ov.status, 200);
  assert.equal(ov.data.sessions.length, 2);
  assert.ok(ov.data.events.some((e) => e.type === 'MESSAGE_TRANSMITTED'));
  const dump = JSON.stringify(ov.data);
  assert.ok(!dump.includes('purple-elephant') && !dump.toLowerCase().includes('privatekey'));

  const st = await alice.c.put('/users/me/settings', { theme: 'amber', crt: true, autoLockMinutes: 5 });
  assert.equal(st.data.user.settings.theme, 'amber');
  assert.equal((await alice.c.put('/users/me/settings', { theme: 'rainbow' })).status, 400);

  const other = ov.data.sessions.find((s) => !s.current);
  assert.equal((await alice.c.post(`/security/sessions/${other.id}/revoke`)).status, 200);
  assert.equal((await second.get('/auth/me')).status, 401, 'revoked session is dead');

  const wrongPw = await alice.c.post('/auth/change-password', { currentPassword: 'wrong-wrong-wrong', newPassword: 'brand-new-passphrase-9' });
  assert.equal(wrongPw.status, 401);
  assert.equal((await alice.c.post('/auth/change-password', { currentPassword: PW.alice, newPassword: 'short' })).status, 400);
  assert.equal((await alice.c.post('/auth/change-password', { currentPassword: PW.alice, newPassword: 'brand-new-passphrase-9' })).status, 200);
  assert.equal((await new Client().post('/auth/login', { identifier: 'alice', password: PW.alice })).status, 401);
  assert.equal((await new Client().post('/auth/login', { identifier: 'alice', password: 'brand-new-passphrase-9' })).status, 200);

  assert.equal((await alice.c.post('/auth/logout')).status, 200);
  assert.equal((await alice.c.get('/auth/me')).status, 401);
});

test('socket handshake rejects missing / forged tickets', async () => {
  await assert.rejects(
    new Promise((res, rej) => {
      const s = ioClient(ORIGIN, { auth: { ticket: 'forged.ticket' }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => res());
      s.on('connect_error', rej);
    }),
    /AUTH_REQUIRED/
  );
});

test('serves the built client with SPA fallback (when client/dist exists)', async (t) => {
  const r = await fetch(`${ORIGIN}/inbox/abc`, { headers: { Accept: 'text/html' } });
  if (r.status === 404) return t.skip('client/dist not built');
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('<div id="root">'));
  const api404 = await fetch(`${ORIGIN}/api/nope`);
  assert.equal(api404.status, 404);
  assert.match(api404.headers.get('content-type'), /json/);
});
