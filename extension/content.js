console.log('[AI Coach] Content script started!');

function getBrowserLanguage() {
  const browserLang = navigator.languages?.[0] || navigator.language || 'en';
  return /^uk/i.test(browserLang) ? 'uk' : 'en';
}

async function getExtensionLanguage() {
  try {
    const data = await chrome.storage.local.get(['extensionLanguage']);
    const storedLanguage = data.extensionLanguage;

    if (storedLanguage === 'uk' || storedLanguage === 'en') {
      return storedLanguage;
    }

    return getBrowserLanguage();
  } catch (e) {
    return getBrowserLanguage();
  }
}

const extensionText = {
  uk: {
    waitingForMove: 'Очікування першого ходу...',
    analyzingMove: '⏳ Аналізую хід...',
    missingApiKey: '⚠️ Вкажіть Gemini API Key у розширенні!',
    analysisFailed: '❌ Помилка аналізу.',
    serverUnavailable: '❌ Сервер недоступний.',
  },
  en: {
    waitingForMove: 'Waiting for the first move...',
    analyzingMove: '⏳ Analyzing move...',
    missingApiKey: '⚠️ Set your Gemini API Key in the extension!',
    analysisFailed: '❌ Analysis failed.',
    serverUnavailable: '❌ Server unavailable.',
  },
};

function isRealGamePage() {
  const path = window.location.pathname;

  const ignoredPrefixes = [
    '/analysis',
    '/editor',
    '/opening',
    '/tv',
    '/streamers',
    '/community',
    '/blog',
    '/forum',
    '/team',
    '/study',
    '/practice',
    '/broadcast',
    '/video',
    '/tournament',
    '/swiss',
  ];

  if (path === '/' || ignoredPrefixes.some((p) => path.startsWith(p))) {
    return false;
  }

  const activeGameRegex = /^\/([a-zA-Z0-9]{8}|[a-zA-Z0-9]{12})(\/(white|black))?$/;
  if (!activeGameRegex.test(path)) {
    return false;
  }

  const isAnalysisBoard = !!document.querySelector('.analyse, .analyse__app, .movenav');
  if (isAnalysisBoard) {
    return false;
  }

  const hasGameApp = !!document.querySelector('.round__app, .cg-wrap');
  const isNotDemoBoard = !document.querySelector('.tv-channel');

  return hasGameApp && isNotDemoBoard;
}

async function restoreWidgetGeometry(widget) {
  try {
    const data = await chrome.storage.local.get(['widgetGeometry']);
    if (data.widgetGeometry) {
      const { width, height, left, top } = data.widgetGeometry;
      const maxLeft = window.innerWidth - 100;
      const maxTop = window.innerHeight - 100;

      if (width) widget.style.width = `${width}px`;
      if (height) widget.style.height = `${height}px`;

      if (left !== undefined && top !== undefined) {
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.left = `${Math.min(Math.max(10, left), maxLeft)}px`;
        widget.style.top = `${Math.min(Math.max(10, top), maxTop)}px`;
      }
    }
  } catch (e) {
    console.error('[AI Coach] Error restoring geometry:', e);
  }
}

function saveWidgetGeometry(widget) {
  const rect = widget.getBoundingClientRect();
  const geometry = {
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top,
  };
  chrome.storage.local.set({ widgetGeometry: geometry });
}

function createWidget() {
  if (document.getElementById('lichess-ai-coach-widget')) return;

  const lang = getBrowserLanguage();
  const texts = extensionText[lang] || extensionText.en;

  const widget = document.createElement('div');
  widget.id = 'lichess-ai-coach-widget';
  widget.innerHTML = `
    <div class="widget-header" id="ai-coach-drag-header">
      <span>♟ AI Coach</span>
      <span id="ai-coach-eval" class="widget-eval">0.0</span>
    </div>
    <div id="ai-coach-text" class="widget-body">
      <div class="move-comment">${texts.waitingForMove}</div>
    </div>

    <div class="resize-handle top"></div>
    <div class="resize-handle bottom"></div>
    <div class="resize-handle left"></div>
    <div class="resize-handle right"></div>
    <div class="resize-handle top-left"></div>
    <div class="resize-handle top-right"></div>
    <div class="resize-handle bottom-left"></div>
    <div class="resize-handle bottom-right"></div>
  `;
  document.body.appendChild(widget);

  restoreWidgetGeometry(widget);

  const header = document.getElementById('ai-coach-drag-header');
  let isDragging = false;
  let dragStartX, dragStartY, initialLeft, initialTop;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = widget.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    widget.style.bottom = 'auto';
    widget.style.right = 'auto';
    widget.style.left = `${initialLeft}px`;
    widget.style.top = `${initialTop}px`;

    e.preventDefault();
  });

  let isResizing = false;
  let currentHandle = null;
  let resizeStartX, resizeStartY, startW, startH, startL, startT;

  const handles = widget.querySelectorAll('.resize-handle');
  handles.forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      currentHandle = handle;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;

      const rect = widget.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      startL = rect.left;
      startT = rect.top;

      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
      widget.style.left = `${startL}px`;
      widget.style.top = `${startT}px`;

      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      widget.style.left = `${initialLeft + dx}px`;
      widget.style.top = `${initialTop + dy}px`;
      return;
    }

    if (isResizing && currentHandle) {
      const dx = e.clientX - resizeStartX;
      const dy = e.clientY - resizeStartY;

      let newW = startW;
      let newH = startH;
      let newL = startL;
      let newT = startT;

      const classList = currentHandle.classList;

      if (
        classList.contains('right') ||
        classList.contains('top-right') ||
        classList.contains('bottom-right')
      ) {
        newW = startW + dx;
      }
      if (
        classList.contains('bottom') ||
        classList.contains('bottom-left') ||
        classList.contains('bottom-right')
      ) {
        newH = startH + dy;
      }
      if (
        classList.contains('left') ||
        classList.contains('top-left') ||
        classList.contains('bottom-left')
      ) {
        newW = startW - dx;
        if (newW > 260) newL = startL + dx;
      }
      if (
        classList.contains('top') ||
        classList.contains('top-left') ||
        classList.contains('top-right')
      ) {
        newH = startH - dy;
        if (newH > 180) newT = startT + dy;
      }

      if (newW >= 260) {
        widget.style.width = `${newW}px`;
        widget.style.left = `${newL}px`;
      }
      if (newH >= 180) {
        widget.style.height = `${newH}px`;
        widget.style.top = `${newT}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging || isResizing) {
      saveWidgetGeometry(widget);
    }
    isDragging = false;
    isResizing = false;
    currentHandle = null;
  });
}

function removeWidget() {
  const existingWidget = document.getElementById('lichess-ai-coach-widget');
  if (existingWidget) {
    existingWidget.remove();
  }
}

async function analyzeMove(movesHistory, rawMove, moveNumber, isBlackMove, playerColor) {
  const storage = await chrome.storage.local.get(['userGeminiKey', 'customServerUrl', 'extensionLanguage']);
  const serverUrl = storage.customServerUrl || DEFAULT_SERVER_URL;
  const apiKey = storage.userGeminiKey;
  const language = (() => {
    const selected = storage.extensionLanguage;
    if (selected === 'uk' || selected === 'en') return selected;
    return getBrowserLanguage();
  })();
  const texts = extensionText[language] || extensionText.en;

  const bodyContainer = document.getElementById('ai-coach-text');
  if (!bodyContainer) return;

  if (
    bodyContainer.children.length === 1 &&
    (bodyContainer.children[0].textContent.includes('Waiting for the first move') ||
      bodyContainer.children[0].textContent.includes('Очікування першого ходу'))
  ) {
    bodyContainer.innerHTML = '';
  }

  const moveLabel = isBlackMove ? `${moveNumber}... ${rawMove}` : `${moveNumber}. ${rawMove}`;
  const moveId = `move-entry-${Date.now()}`;

  const moveCard = document.createElement('div');
  moveCard.id = moveId;
  moveCard.className = 'move-entry loading';
  moveCard.innerHTML = `
    <div class="move-title">♟ ${moveLabel}</div>
    <div class="move-comment">${texts.analyzingMove}</div>
  `;

  bodyContainer.prepend(moveCard);

  while (bodyContainer.children.length > 10) {
    bodyContainer.removeChild(bodyContainer.lastChild);
  }

  if (!apiKey) {
    moveCard.classList.remove('loading');
    moveCard.querySelector('.move-comment').textContent = texts.missingApiKey;
    return;
  }

  try {
    const response = await fetch(`${serverUrl}/api/analyze-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movesHistory,
        rawMove,
        playerColor,
        userGeminiKey: apiKey,
        language,
      }),
    });

    const data = await response.json();
    const evalEl = document.getElementById('ai-coach-eval');

    if (data.success) {
      moveCard.classList.remove('loading');

      if (evalEl) {
        if (rawMove.includes('#')) {
          evalEl.textContent = '#M';
          evalEl.style.color = '#3b82f6';
        } else {
          evalEl.textContent = data.evaluation > 0 ? `+${data.evaluation}` : data.evaluation;
          evalEl.style.color = '#62992e';
        }
      }
      moveCard.querySelector('.move-comment').textContent = data.comment;
    } else {
      moveCard.classList.remove('loading');
      moveCard.querySelector('.move-comment').textContent = texts.analysisFailed;
    }
  } catch (err) {
    moveCard.classList.remove('loading');
    moveCard.querySelector('.move-comment').textContent = texts.serverUnavailable;
  }
}

function extractMoveText(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  const evals = clone.querySelectorAll('eval, .eval, index');
  evals.forEach((e) => e.remove());

  return (clone.innerText || clone.textContent || '').trim();
}

function getMoveNodes() {
  let nodes = document.querySelectorAll('z7yx');
  if (nodes.length === 0) {
    nodes = document.querySelectorAll('l4x move, rm6 move, kwdb');
  }
  return nodes;
}

function initMoveObserver() {
  let lastHandledCount = 0;

  setInterval(() => {
    chrome.storage.local.get(['isEnabled'], (data) => {
      const isEnabled = data.isEnabled !== false;

      if (!isEnabled || !isRealGamePage()) {
        removeWidget();
        lastHandledCount = 0;
        return;
      }

      createWidget();

      const moveNodes = getMoveNodes();

      if (moveNodes.length > 0 && moveNodes.length !== lastHandledCount) {
        lastHandledCount = moveNodes.length;

        const movesHistory = Array.from(moveNodes)
          .map((node) => extractMoveText(node))
          .filter((text) => text.length > 0);

        const rawMove = movesHistory[movesHistory.length - 1];

        if (rawMove && movesHistory.length > 0) {
          const moveNumber = Math.ceil(movesHistory.length / 2);
          const isBlackMove = movesHistory.length % 2 === 0;

          const isBlack = document
            .querySelector('.cg-wrap')
            ?.classList.contains('orientation-black');
          const playerColor = isBlack ? 'black' : 'white';

          analyzeMove(movesHistory, rawMove, moveNumber, isBlackMove, playerColor);
        }
      }
    });
  }, 500);
}

initMoveObserver();
