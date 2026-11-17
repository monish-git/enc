import { z } from 'zod';
import { HttpError } from '../utils/errors.js';
import { ALG, GCM_TAG_BYTES, IV_BYTES, MAX_CIPHERTEXT_BYTES, PUBKEY_RE, SALT_BYTES, THEMES, USERNAME_RE } from '../config/constants.js';

export const validate =
  (schema, part = 'body') =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[part]);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path?.join('.') || part;
      throw new HttpError(400, `INVALID INPUT: ${where.toUpperCase()} - ${first?.message || 'bad value'}`, 'VALIDATION');
    }
    // `req.query` is a getter in some Express versions, so store parsed data separately.
    req.valid = { ...(req.valid || {}), [part]: parsed.data };
    next();
  };

const b64Len = (s) => Buffer.from(s, 'base64').length;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const publicKeyField = z
  .string()
  .regex(PUBKEY_RE, 'must be a base64 X25519 public key')
  .refine((s) => Buffer.from(s, 'base64').some((b) => b !== 0), 'invalid key');

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');

export const schemas = {
  register: z.object({
    username: z.string().trim().toLowerCase().regex(USERNAME_RE, '3-20 chars: a-z, 0-9, underscore'),
    email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalid email'),
    password: z.string().min(1).max(128),
    publicKey: publicKeyField,
  }),
  login: z.object({
    identifier: z.string().trim().toLowerCase().min(1).max(254),
    password: z.string().min(1).max(128),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
  }),
  resetKey: z.object({ password: z.string().min(1).max(128), publicKey: publicKeyField }),
  settings: z
    .object({
      theme: z.enum(THEMES),
      crt: z.boolean(),
      scanlines: z.boolean(),
      sound: z.boolean(),
      previewBeforeSend: z.boolean(),
      autoLockMinutes: z.number().int().min(0).max(240),
      requirePasswordToDecrypt: z.boolean(),
      statusMessage: z.string().max(80),
    })
    .partial(),
  search: z.object({ q: z.string().trim().min(2).max(20) }),
  idParam: z.object({ id: objectId }),
  contactRequest: z.object({ userId: objectId }),
  newConversation: z.object({ userId: objectId }),
  archive: z.object({ archived: z.boolean() }),
  messageList: z.object({
    before: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
  sendMessage: z.object({
    ciphertext: z
      .string()
      .regex(B64, 'must be base64')
      .refine((s) => b64Len(s) >= GCM_TAG_BYTES + 1 && b64Len(s) <= MAX_CIPHERTEXT_BYTES, 'bad ciphertext size'),
    iv: z.string().regex(B64).refine((s) => b64Len(s) === IV_BYTES, 'IV must be 12 bytes'),
    salt: z.string().regex(B64).refine((s) => b64Len(s) === SALT_BYTES, 'salt must be 16 bytes'),
    alg: z.literal(ALG),
    senderFp: z.string().regex(/^[a-f0-9]{64}$/),
    recipientFp: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  report: z.object({
    reason: z.enum(['spam', 'harassment', 'phishing', 'illegal', 'other']),
    details: z.string().max(500).default(''),
  }),
};
