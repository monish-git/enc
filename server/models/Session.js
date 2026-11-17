import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Only a SHA-256 of the cookie token is stored, so a DB leak cannot be replayed as a session.
  tokenHash: { type: String, required: true, unique: true },
  userAgent: { type: String, default: '', maxlength: 300 },
  ip: { type: String, default: '', maxlength: 64 },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false },
});

// Mongo removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
