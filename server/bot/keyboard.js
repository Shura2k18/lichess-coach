import { t } from './i18n.js';

export const getMainMenuKeyboard = (user) => {
  const isActive = user?.isActive ?? false;

  return {
    reply_markup: {
      keyboard: [
        [
          { text: isActive ? t(user, 'menu.disable_bot') : t(user, 'menu.enable_bot') },
          { text: t(user, 'menu.status') },
          { text: t(user, 'menu.language') },
        ],
        [{ text: t(user, 'menu.api') }],
      ],
      resize_keyboard: true,
      persistent: true,
    },
  };
};
