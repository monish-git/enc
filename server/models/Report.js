import mongoose from 'mongoose';

// Reports contain NO message content (the server cannot read it). They reference the message id only.
const reportSchema = new mongoose.Schema({
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['spam', 'harassment', 'phishing', 'illegal', 'other'], required: true },
  details: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});

reportSchema.index({ message: 1, reporter: 1 }, { unique: true });

export const Report = mongoose.model('Report', reportSchema);
