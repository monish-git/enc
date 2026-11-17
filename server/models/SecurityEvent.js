import mongoose from 'mongoose';

// Server-side security log. Never contains message content, passwords or key material.
const securityEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, maxlength: 40 },
  level: { type: String, enum: ['info', 'warn', 'alert'], default: 'info' },
  message: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
});

securityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
securityEventSchema.index({ user: 1, createdAt: -1 });

export const SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);
