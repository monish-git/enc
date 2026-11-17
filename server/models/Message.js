import mongoose from 'mongoose';

// The server only ever stores ciphertext + the public parameters needed to decrypt it
// (IV, HKDF salt, key fingerprints). There is no plaintext field anywhere.
const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ciphertext: { type: String, required: true }, // base64( AES-256-GCM ciphertext || 16-byte tag )
  iv: { type: String, required: true }, // base64, 12 bytes, unique per message
  salt: { type: String, required: true }, // base64, 16 bytes, HKDF salt unique per message
  alg: { type: String, required: true },
  senderFp: { type: String, required: true },
  recipientFp: { type: String, required: true },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, status: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
