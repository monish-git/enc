import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// scrypt (memory-hard). Parameters are stored inside the hash string so they can be raised later.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const maxmem = 128 * N * R * 2;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem });
  return ['scrypt', N, R, P, salt.toString('base64'), dk.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const dk = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

// Used to keep response time similar when the account does not exist.
let dummy;
export async function dummyVerify(password) {
  dummy ||= await hashPassword('ecn-dummy-password');
  await verifyPassword(password, dummy);
}

const COMMON = new Set([
  'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345',
  'iloveyou123', 'letmein1234', 'admin12345', 'welcome1234', 'passw0rd123', '0123456789',
]);

export function passwordProblem(password, username) {
  if (password.length < 10) return 'PASSWORD MUST BE AT LEAST 10 CHARACTERS';
  if (password.length > 128) return 'PASSWORD TOO LONG (MAX 128)';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'PASSWORD IS TOO COMMON';
  if (username && lower.includes(username.toLowerCase())) return 'PASSWORD MUST NOT CONTAIN YOUR USERNAME';
  if (/^(.)\1+$/.test(password)) return 'PASSWORD IS TOO SIMPLE';
  return null;
}
