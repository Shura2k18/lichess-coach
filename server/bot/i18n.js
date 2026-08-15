export const translations = {
  uk: {
    menu: {
      enable_bot: '🟢 Увімкнути бота',
      disable_bot: '🔴 Вимкнути бота',
      status: '📊 Статус',
      language: '🌐 Мова',
      api: '🔐 API',
      back: '⬅️ Назад',
      lichess_token: '🔑 Lichess Token',
      gemini_key: '🤖 Gemini API Key',
    },
    bot: {
      wait_db: '⏳ Зачекайте, бот підключається до бази даних...',
      greeting: 'Привіт! Я твій шаховий тренер. Налаштуй токен Lichess та ключ Gemini за допомогою нижньої панелі, щоб розпочати аналіз.',
      db_not_connected: '❌ База даних ще не підключена.',
      token_required: '❌ Спочатку встановіть Lichess API token через кнопку **🔑 Lichess Token**!',
      ask_lichess_token: '🔑 **Надішли свій Lichess Token наступним повідомленням.**\n\nСтворити його можна тут: https://lichess.org/account/oauth/token/create (потрібні права "board:play")\n\n*Повідомлення буде миттєво видалено з чату.*',
      ask_gemini_key: '🤖 **Надішли свій Gemini API Key наступним повідомленням.**\n\n*Повідомлення буде миттєво видалено, а ключ зашифровано у базі.*',
      saved_gemini: '🔒 **Gemini API ключ успішно збережено у зашифрованому вигляді!**',
      saved_token: '🔒 **Lichess Token успішно збережено у зашифрованому вигляді!**',
      error_gemini_save: '❌ Помилка під час збереження API ключа.',
      error_token_save: '❌ Помилка під час збереження токена.',
      status_title: '📊 **Статус акаунта:**',
      token_saved: '🔒 Збережено (зашифровано)',
      token_missing: '❌ Відсутній',
      key_saved: '🔒 Збережено (зашифровано)',
      key_missing: '❌ Відсутній',
      tracking_active: '🟢 Активне',
      tracking_inactive: '🔴 Зупинено',
      bot_enabled: '🟢 **Бот увімкнений і відстежує партії!**',
      bot_disabled: '🔴 **Бот вимкнений.**',
      lang_prompt: '🌐 **Виберіть мову бота:**',
      lang_changed_uk: 'Мова змінена на українську.',
      lang_changed_en: 'Language changed to English.',
      command_lang: '/lang',
    },
    errors: {
      start: '❌ Помилка в /start:',
      decrypt_token: 'Помилка розшифровки токена:',
      save_gemini: 'Помилка збереження Gemini API ключа:',
      save_token: 'Помилка збереження Lichess токена:',
      process_message: '❌ Помилка обробки повідомлення:',
    },
  },
  en: {
    menu: {
      enable_bot: '🟢 Enable bot',
      disable_bot: '🔴 Disable bot',
      status: '📊 Status',
      language: '🌐 Language',
      api: '🔐 API',
      back: '⬅️ Back',
      lichess_token: '🔑 Lichess Token',
      gemini_key: '🤖 Gemini API Key',
    },
    bot: {
      wait_db: '⏳ Please wait, the bot is connecting to the database...',
      greeting: 'Hi! I am your chess coach. Configure your Lichess token and Gemini key using the bottom panel to start analysis.',
      db_not_connected: '❌ Database is not connected yet.',
      token_required: '❌ First set the Lichess API token via the **🔑 Lichess Token** button!',
      ask_lichess_token: '🔑 **Send your Lichess Token in the next message.**\n\nYou can create it here: https://lichess.org/account/oauth/token/create (requires "board:play" rights)\n\n*The message will be deleted from the chat immediately.*',
      ask_gemini_key: '🤖 **Send your Gemini API Key in the next message.**\n\n*The message will be deleted immediately and the key will be stored encrypted in the database.*',
      saved_gemini: '🔒 **Gemini API key successfully saved in encrypted form!**',
      saved_token: '🔒 **Lichess Token successfully saved in encrypted form!**',
      error_gemini_save: '❌ Error while saving API key.',
      error_token_save: '❌ Error while saving token.',
      status_title: '📊 **Account status:**',
      token_saved: '🔒 Saved (encrypted)',
      token_missing: '❌ Missing',
      key_saved: '🔒 Saved (encrypted)',
      key_missing: '❌ Missing',
      tracking_active: '🟢 Active',
      tracking_inactive: '🔴 Stopped',
      bot_enabled: '🟢 **Bot enabled and tracking games!**',
      bot_disabled: '🔴 **Bot disabled.**',
      lang_prompt: '🌐 **Choose the bot language:**',
      lang_changed_uk: 'Мова змінена на українську.',
      lang_changed_en: 'Language changed to English.',
      command_lang: '/lang',
    },
    errors: {
      start: '❌ Error in /start:',
      decrypt_token: 'Error decrypting token:',
      save_gemini: 'Error saving Gemini API key:',
      save_token: 'Error saving Lichess token:',
      process_message: '❌ Error processing message:',
    },
  },
};

export function getUserLanguage(user) {
  if (!user || !user.language) return 'uk';
  return user.language === 'en' ? 'en' : 'uk';
}

export function t(user, key, params = {}) {
  const lang = getUserLanguage(user);
  const dictionary = translations[lang] || translations.uk;
  const value = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dictionary);

  if (value === undefined) {
    const fallback = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), translations.uk);
    if (fallback !== undefined) return fallback;
    return key;
  }

  return Object.entries(params).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), value);
}
