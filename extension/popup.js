const extensionTranslations = {
  uk: {
    toggleLabel: 'Аналіз ходів:',
    serverUrlLabel: 'URL бекенд-сервера:',
    resetServerBtn: 'Повернути типове',
    apiKeyLabel: 'Gemini API Key:',
    languageLabel: 'Мова:',
    browserDefault: 'Типова мова браузера',
    saveBtn: 'Зберегти налаштування',
    savedStatus: 'Збережено!',
  },
  en: {
    toggleLabel: 'Analyze moves:',
    serverUrlLabel: 'Backend Server URL:',
    resetServerBtn: 'Reset to default',
    apiKeyLabel: 'Gemini API Key:',
    languageLabel: 'Language:',
    browserDefault: 'Browser default',
    saveBtn: 'Save settings',
    savedStatus: 'Saved!',
  },
};

function getBrowserLanguage() {
  const preferred = navigator.languages?.[0] || navigator.language || 'en';
  return /^uk/i.test(preferred) ? 'uk' : 'en';
}

function getEffectiveLanguage(languagePreference) {
  if (languagePreference === 'uk' || languagePreference === 'en') {
    return languagePreference;
  }
  return getBrowserLanguage();
}

function applyPopupLabels(languagePreference) {
  const browserLang = getBrowserLanguage();
  const activeLang = languagePreference === 'browser' ? browserLang : getEffectiveLanguage(languagePreference);
  const texts = extensionTranslations[activeLang] || extensionTranslations.en;

  document.documentElement.lang = activeLang;

  const toggleLabel = document.getElementById('toggleLabel');
  const serverUrlLabel = document.getElementById('serverUrlLabel');
  const apiKeyLabel = document.getElementById('apiKeyLabel');
  const languageLabel = document.getElementById('languageLabel');
  const saveBtn = document.getElementById('saveBtn');
  const resetServerBtn = document.getElementById('resetServerBtn');
  const languageSelect = document.getElementById('languageSelect');

  toggleLabel.textContent = texts.toggleLabel;
  serverUrlLabel.textContent = texts.serverUrlLabel;
  resetServerBtn.textContent = texts.resetServerBtn;
  apiKeyLabel.textContent = texts.apiKeyLabel;
  languageLabel.textContent = texts.languageLabel;
  languageSelect.options[0].textContent = texts.browserDefault;
  saveBtn.textContent = texts.saveBtn;
}

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const serverUrlInput = document.getElementById('serverUrl');
  const toggleInput = document.getElementById('extensionToggle');
  const languageSelect = document.getElementById('languageSelect');
  const saveBtn = document.getElementById('saveBtn');
  const resetServerBtn = document.getElementById('resetServerBtn');
  const statusDiv = document.getElementById('status');

  chrome.storage.local.get(['userGeminiKey', 'customServerUrl', 'isEnabled', 'extensionLanguage'], (data) => {
    if (data.userGeminiKey) {
      apiKeyInput.value = data.userGeminiKey;
    }
    serverUrlInput.value = data.customServerUrl || DEFAULT_SERVER_URL;
    toggleInput.checked = data.isEnabled !== false;

    const storedValue = data.extensionLanguage;
    const selectedLanguage = storedValue === 'browser' || storedValue === 'uk' || storedValue === 'en'
      ? storedValue
      : 'browser';
    languageSelect.value = selectedLanguage;
    applyPopupLabels(selectedLanguage);
  });

  languageSelect.addEventListener('change', () => {
    applyPopupLabels(languageSelect.value);
  });

  resetServerBtn.addEventListener('click', () => {
    serverUrlInput.value = DEFAULT_SERVER_URL;
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    let serverUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
    if (!serverUrl) serverUrl = DEFAULT_SERVER_URL;
    const isEnabled = toggleInput.checked;
    const selectedLanguage = languageSelect.value;

    chrome.storage.local.set(
      {
        userGeminiKey: key,
        customServerUrl: serverUrl,
        isEnabled: isEnabled,
        extensionLanguage: selectedLanguage,
      },
      () => {
        const savedText = (extensionTranslations[getEffectiveLanguage(selectedLanguage)] || extensionTranslations.en).savedStatus;
        statusDiv.textContent = savedText;
        statusDiv.style.color = '#4ade80';

        setTimeout(() => {
          statusDiv.textContent = '';
        }, 2000);
      }
    );
  });
});
