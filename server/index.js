import 'dotenv/config';
import mongoose from 'mongoose';
import TelegramBot from 'node-telegram-bot-api';
import { User } from './models/User.js';
import { decrypt } from './utils/crypto.js';
import { listenLichessEvents } from './services/lichessStream.js';
import { setupBotHandlers } from './bot/handlers.js';
import { startServer } from './server.js';

const isBotActive = process.env.IS_BOT_ACTIVE === 'true';
const activeStreams = new Map();
let isDbConnectedFlag = false;

const isDbConnected = () => isDbConnectedFlag;

function startLichessStream(chatId, token, bot) {
  stopLichessStream(chatId);
  const controller = new AbortController();
  activeStreams.set(chatId, controller);
  listenLichessEvents(chatId, token, bot, controller.signal);
}

function stopLichessStream(chatId) {
  const controller = activeStreams.get(chatId);
  if (controller) {
    controller.abort();
    activeStreams.delete(chatId);
  }
}

async function bootstrap() {
  // 1. Always start the REST API server for the browser extension
  startServer();

  // 2. If bot mode is not enabled - stop in standalone mode
  if (!isBotActive) {
    console.log('🚀 Server started in standalone mode (Telegram bot and MongoDB disabled)');
    return;
  }

  // 3. Validate required variables for full bot-enabled mode
  const { TELEGRAM_BOT_TOKEN, MONGO_URI } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !MONGO_URI) {
    console.error('❌ Error: IS_BOT_ACTIVE=true but TELEGRAM_BOT_TOKEN or MONGO_URI is missing');
    process.exit(1);
  }

  console.log('🤖 Initializing Telegram bot and database...');

  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  const boundStartStream = (chatId, token) => startLichessStream(chatId, token, bot);
  setupBotHandlers(bot, isDbConnected, boundStartStream, stopLichessStream);

  // 4. Connecting to MongoDB
  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(MONGO_URI);
    isDbConnectedFlag = true;
    console.log('✅ Successfully connected to MongoDB');

    const activeUsers = await User.find({ isActive: true, 'token.content': { $exists: true } });
    for (const user of activeUsers) {
      try {
        const rawToken = decrypt(user.token);
        boundStartStream(user.chatId, rawToken);
      } catch (e) {
        console.error(`Failed to decrypt token for chatId: ${user.chatId}`);
      }
    }
  } catch (err) {
    console.error('❌ Error connecting to MongoDB:', err.message);
  }
}

bootstrap();
