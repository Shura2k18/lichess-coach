import { User } from '../models/User.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getMainMenuKeyboard } from './keyboard.js';
import { t } from './i18n.js';

const userState = new Map();

async function showLanguageMenu(bot, chatId, user) {
  await bot.sendMessage(chatId, t(user, 'bot.lang_prompt'), {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Українська', callback_data: 'set_lang:uk' },
          { text: 'English', callback_data: 'set_lang:en' },
        ],
        [{ text: t(user, 'menu.back'), callback_data: 'menu_back' }],
      ],
    },
  });
}

async function showApiMenu(bot, chatId, user) {
  await bot.sendMessage(chatId, '🔐 **API**', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔑 Lichess API', callback_data: 'api_select:lichess' },
          { text: '🤖 Gemini API', callback_data: 'api_select:gemini' },
        ],
        [{ text: t(user, 'menu.back'), callback_data: 'menu_back' }],
      ],
    },
  });
}

export function setupBotHandlers(bot, isDbConnected, startLichessStream, stopLichessStream) {
  bot.onText(/\/lang\b/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      if (!isDbConnected()) {
        return bot.sendMessage(chatId, t({ language: 'uk' }, 'bot.db_not_connected'));
      }

      let user = await User.findOne({ chatId });
      if (!user) {
        user = await User.create({ chatId });
      }
      await showLanguageMenu(bot, chatId, user);
    } catch (err) {
      console.error('❌ Error opening language menu:', err);
    }
  });

  bot.on('callback_query', async (query) => {
    if (!query.data) return;

    const chatId = query.message?.chat?.id;
    if (!chatId) return;

    if (query.data.startsWith('set_lang:')) {
      const language = query.data.replace('set_lang:', '');
      if (!['uk', 'en'].includes(language)) return;

      try {
        let user = await User.findOne({ chatId });
        if (!user) {
          user = await User.create({ chatId });
        }

        user.language = language;
        await user.save();

        const selectedMessage = language === 'uk' ? t(user, 'bot.lang_changed_uk') : t(user, 'bot.lang_changed_en');
        await bot.answerCallbackQuery(query.id, { text: selectedMessage });
        await bot.sendMessage(chatId, selectedMessage);
        await bot.sendMessage(chatId, t(user, 'bot.greeting'), getMainMenuKeyboard(user));
      } catch (err) {
        console.error('❌ Error changing language:', err);
      }
      return;
    }

    if (query.data === 'menu_back') {
      try {
        let user = await User.findOne({ chatId });
        if (!user) {
          user = await User.create({ chatId });
        }
        await bot.answerCallbackQuery(query.id, { text: t(user, 'menu.back') });
        await bot.sendMessage(chatId, t(user, 'bot.greeting'), getMainMenuKeyboard(user));
      } catch (err) {
        console.error('❌ Error returning to main menu:', err);
      }
      return;
    }

    if (query.data.startsWith('api_select:')) {
      const type = query.data.replace('api_select:', '');
      const user = await User.findOne({ chatId });
      if (!user) return;

      try {
        await bot.answerCallbackQuery(query.id, { text: type === 'lichess' ? '🔑 Lichess API' : '🤖 Gemini API' });
        if (type === 'lichess') {
          userState.set(chatId, 'awaiting_lichess_token');
          await bot.sendMessage(chatId, t(user, 'bot.ask_lichess_token'), { parse_mode: 'Markdown' });
        } else {
          userState.set(chatId, 'awaiting_gemini_key');
          await bot.sendMessage(chatId, t(user, 'bot.ask_gemini_key'), { parse_mode: 'Markdown' });
        }
      } catch (err) {
        console.error('❌ Error selecting API type:', err);
      }
      return;
    }
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    userState.delete(chatId);

    try {
      if (!isDbConnected()) {
        return bot.sendMessage(chatId, t({ language: 'uk' }, 'bot.wait_db'));
      }

      let user = await User.findOne({ chatId });
      if (!user) {
        user = await User.create({ chatId });
      }

      await bot.sendMessage(chatId, t(user, 'bot.greeting'), getMainMenuKeyboard(user));
    } catch (err) {
      console.error(t({ language: 'uk' }, 'errors.start'), err);
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/start') || msg.text.startsWith('/lang')) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const currentState = userState.get(chatId);

    if (!isDbConnected()) {
      return bot.sendMessage(chatId, t({ language: 'uk' }, 'bot.db_not_connected'));
    }

    try {
      let user = await User.findOne({ chatId });
      if (!user) {
        user = await User.create({ chatId });
      }

      const enableBotLabel = t(user, 'menu.enable_bot');
      const disableBotLabel = t(user, 'menu.disable_bot');
      const statusLabel = t(user, 'menu.status');
      const languageLabel = t(user, 'menu.language');
      const apiLabel = t(user, 'menu.api');
      const backLabel = t(user, 'menu.back');
      const lichessTokenLabel = t(user, 'menu.lichess_token');
      const geminiKeyLabel = t(user, 'menu.gemini_key');

      if (text === enableBotLabel || text === disableBotLabel) {
        userState.delete(chatId);

        if (!user.token?.content) {
          return await bot.sendMessage(chatId, t(user, 'bot.token_required'), { parse_mode: 'Markdown' });
        }

        user.isActive = !user.isActive;
        await user.save();

        if (user.isActive) {
          try {
            const rawToken = decrypt(user.token);
            startLichessStream(chatId, rawToken);
          } catch (e) {
            console.error(t(user, 'errors.decrypt_token'), e.message);
          }
        } else {
          stopLichessStream(chatId);
        }

        return await bot.sendMessage(
          chatId,
          user.isActive ? t(user, 'bot.bot_enabled') : t(user, 'bot.bot_disabled'),
          { parse_mode: 'Markdown', ...getMainMenuKeyboard(user) }
        );
      }

      if (text === languageLabel) {
        return await showLanguageMenu(bot, chatId, user);
      }

      if (text === apiLabel || text === backLabel) {
        if (text === backLabel) {
          return await bot.sendMessage(chatId, t(user, 'bot.greeting'), getMainMenuKeyboard(user));
        }
        return await showApiMenu(bot, chatId, user);
      }

      if (text === lichessTokenLabel) {
        userState.set(chatId, 'awaiting_lichess_token');
        return await bot.sendMessage(chatId, t(user, 'bot.ask_lichess_token'), { parse_mode: 'Markdown' });
      }

      if (text === geminiKeyLabel) {
        userState.set(chatId, 'awaiting_gemini_key');
        return await bot.sendMessage(chatId, t(user, 'bot.ask_gemini_key'), { parse_mode: 'Markdown' });
      }

      if (text === statusLabel) {
        userState.delete(chatId);
        const hasLichessToken = Boolean(user.token?.content);
        const hasGeminiKey = Boolean(user.geminiKey?.content);

        const statusText = `${t(user, 'bot.status_title')}\n\n• Lichess Token: ${
          hasLichessToken ? t(user, 'bot.token_saved') : t(user, 'bot.token_missing')
        }\n• Gemini API Key: ${
          hasGeminiKey ? t(user, 'bot.key_saved') : t(user, 'bot.key_missing')
        }\n• Tracking: ${user.isActive ? t(user, 'bot.tracking_active') : t(user, 'bot.tracking_inactive')}`;

        return await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
      }

      if (currentState === 'awaiting_gemini_key') {
        userState.delete(chatId);
        try {
          await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}

        try {
          user.geminiKey = encrypt(text);
          await user.save();
          await bot.sendMessage(chatId, t(user, 'bot.saved_gemini'), getMainMenuKeyboard(user));
        } catch (err) {
          console.error(t(user, 'errors.save_gemini'), err);
          await bot.sendMessage(chatId, t(user, 'bot.error_gemini_save'));
        }
        return;
      }

      if (currentState === 'awaiting_lichess_token' || text.startsWith('lip_')) {
        userState.delete(chatId);
        try {
          await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}

        try {
          user.token = encrypt(text);
          await user.save();
          await bot.sendMessage(chatId, t(user, 'bot.saved_token'), getMainMenuKeyboard(user));
        } catch (err) {
          console.error(t(user, 'errors.save_token'), err);
          await bot.sendMessage(chatId, t(user, 'bot.error_token_save'));
        }
        return;
      }
    } catch (error) {
      console.error(t({ language: 'uk' }, 'errors.process_message'), error);
    }
  });
}
