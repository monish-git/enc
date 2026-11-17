import mongoose from 'mongoose';

const loginEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  identifier: { type: String, default: '', maxlength: 80 },
  success: { type: Boolean, required: true },
  reason: { type: String, enum: ['ok', 'bad_password', 'unknown_user', 'locked'], default: 'ok' },
  ip: { type: String, default: '', maxlength: 64 },
  userAgent: { type: String, default: '', maxlength: 300 },
  createdAt: { type: Date, default: Date.now },
});

loginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
loginEventSchema.index({ user: 1, createdAt: -1 });

export const LoginEvent = mongoose.model('LoginEvent', loginEventSchema);
