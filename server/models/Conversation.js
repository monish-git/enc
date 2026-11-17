import mongoose from 'mongoose';

const stateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    archived: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    // Messages at or before this moment are hidden for this user ("delete conversation").
    clearedAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: (v) => v.length === 2,
      index: true,
    },
    pairKey: { type: String, required: true, unique: true },
    state: { type: [stateSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.methods.stateFor = function stateFor(userId) {
  return this.state.find((s) => String(s.user) === String(userId));
};

export const Conversation = mongoose.model('Conversation', conversationSchema);
