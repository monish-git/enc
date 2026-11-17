import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pairKey: { type: String, required: true, unique: true }, // "<smallerId>:<largerId>"
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ requester: 1, status: 1 });
contactSchema.index({ recipient: 1, status: 1 });

export const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

export const Contact = mongoose.model('Contact', contactSchema);
