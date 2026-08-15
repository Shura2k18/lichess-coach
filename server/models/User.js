import mongoose from 'mongoose';

const encryptedDataSchema = new mongoose.Schema(
  {
    iv: String,
    content: String,
    tag: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  token: encryptedDataSchema, // <--- Encrypted Lichess Token object
  geminiKey: encryptedDataSchema, // <--- Encrypted Gemini API Key object
  language: { type: String, enum: ['uk', 'en'], default: 'uk' },
  isActive: { type: Boolean, default: false },
});

export const User = mongoose.model('User', userSchema);
