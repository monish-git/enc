import mongoose from 'mongoose';
import { THEMES, USERNAME_RE } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: USERNAME_RE,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    // Public half of the X25519 identity key (raw 32 bytes, base64). The private key never leaves the browser.
    publicKey: { type: String, required: true },
    keyFingerprint: { type: String, required: true }, // sha256(raw public key), hex
    keyUpdatedAt: { type: Date, default: Date.now },
    statusMessage: { type: String, default: '', maxlength: 80 },
    settings: {
      theme: { type: String, enum: THEMES, default: 'win95' },
      crt: { type: Boolean, default: false },
      scanlines: { type: Boolean, default: true },
      sound: { type: Boolean, default: false },
      previewBeforeSend: { type: Boolean, default: true },
      autoLockMinutes: { type: Number, default: 15, min: 0, max: 240 },
      requirePasswordToDecrypt: { type: Boolean, default: false },
    },
    lastSeen: { type: Date, default: null },
    notificationsSeenAt: { type: Date, default: () => new Date(0) },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
