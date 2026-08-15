import mongoose from 'mongoose';

const gameLogSchema = new mongoose.Schema({
  gameId: { type: String, required: true, index: true },
  chatId: { type: Number, required: true },
  messageIds: [{ type: Number }],
  createdAt: { type: Date, default: Date.now, expires: '7d' }, // Automatic deletion of old logs after 7 days
});

export const GameLog = mongoose.model('GameLog', gameLogSchema);
