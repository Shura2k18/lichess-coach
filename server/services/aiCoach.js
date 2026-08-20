import { GoogleGenAI } from '@google/genai';
import { Chess } from 'chess.js';

const pieceNames = {
  uk: {
    p: 'пішак',
    n: 'кінь',
    b: 'слон',
    r: 'тура',
    q: 'ферзь',
    k: 'король',
  },
  en: {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  },
};

// Models are tried in this order.
const MODELS_FALLBACK_LIST = [
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

const GEMMA_MODELS = new Set(['gemma-4-26b-a4b-it', 'gemma-4-31b-it']);

function squareToCoords(square) {
  return {
    file: square.charCodeAt(0) - 97,
    rank: Number(square[1]) - 1,
  };
}

function coordsToSquare(file, rank) {
  return String.fromCharCode(97 + file) + String(rank + 1);
}

/*
 * Best-effort reconstruction of the position BEFORE the last move.
 *
 * The function receives the current FEN (normally after the move)
 * and lastMoveObj. It restores:
 * - the moved piece
 * - captured piece
 * - en-passant capture
 * - castling rook movement
 * - basic castling rights
 *
 * If fenBefore is supplied directly to explainMove(), that value
 * is always preferred.
 */
function reconstructFenBefore(fenAfter, lastMoveObj) {
  if (!fenAfter || !lastMoveObj?.from || !lastMoveObj?.to) {
    return null;
  }

  try {
    const parts = fenAfter.split(' ');

    if (parts.length < 6) {
      return null;
    }

    const board = parts[0].split('/').map((rankText) => {
      const row = [];

      for (const char of rankText) {
        if (/\d/.test(char)) {
          for (let i = 0; i < Number(char); i++) {
            row.push(null);
          }
        } else {
          row.push(char);
        }
      }

      return row;
    });

    const from = squareToCoords(lastMoveObj.from);
    const to = squareToCoords(lastMoveObj.to);

    const movingPiece = board[7 - to.rank]?.[to.file];

    if (!movingPiece) {
      return null;
    }

    const movingColor = movingPiece === movingPiece.toUpperCase() ? 'w' : 'b';

    const pawnChar = movingColor === 'w' ? 'P' : 'p';

    // Remove moved piece from destination.
    board[7 - to.rank][to.file] = null;

    // Restore moved piece on original square.
    const originalPiece = lastMoveObj.promotion ? pawnChar : movingPiece;

    board[7 - from.rank][from.file] = originalPiece;

    /*
     * Restore captured piece.
     */
    if (lastMoveObj.captured) {
      const capturedColor = movingColor === 'w' ? 'b' : 'w';

      const capturedPiece =
        lastMoveObj.captured === 'p'
          ? capturedColor === 'w'
            ? 'P'
            : 'p'
          : capturedColor === 'w'
            ? lastMoveObj.captured.toUpperCase()
            : lastMoveObj.captured.toLowerCase();

      const isEnPassant =
        lastMoveObj.captured === 'p' &&
        from.file !== to.file &&
        board[7 - to.rank][to.file] === null;

      if (isEnPassant) {
        const capturedRank = movingColor === 'w' ? to.rank - 1 : to.rank + 1;

        if (capturedRank >= 0 && capturedRank <= 7) {
          board[7 - capturedRank][to.file] = capturedPiece;
        }
      } else {
        board[7 - to.rank][to.file] = capturedPiece;
      }
    }

    /*
     * Undo castling rook movement.
     */
    const isKing = lastMoveObj.piece === 'k' || movingPiece.toLowerCase() === 'k';

    if (isKing && Math.abs(to.file - from.file) === 2) {
      const rank = from.rank;
      const rook = movingColor === 'w' ? 'R' : 'r';

      if (to.file > from.file) {
        // King side: h -> f, restore f -> h.
        board[7 - rank][5] = null;
        board[7 - rank][7] = rook;
      } else {
        // Queen side: a -> d, restore d -> a.
        board[7 - rank][3] = null;
        board[7 - rank][0] = rook;
      }
    }

    const boardText = board
      .map((row) => {
        let result = '';
        let empty = 0;

        for (const cell of row) {
          if (!cell) {
            empty++;
          } else {
            if (empty) {
              result += empty;
              empty = 0;
            }

            result += cell;
          }
        }

        if (empty) {
          result += empty;
        }

        return result;
      })
      .join('/');

    /*
     * Before the move it was the moving side's turn.
     */
    const activeColor = movingColor;

    /*
     * Restore en-passant target if this was a two-square pawn move.
     */
    let enPassant = '-';

    if (lastMoveObj.piece === 'p' && Math.abs(to.rank - from.rank) === 2) {
      const epRank = (from.rank + to.rank) / 2;

      enPassant = coordsToSquare(from.file, epRank);
    }

    /*
     * Try to restore castling rights.
     */
    let castling = parts[2];

    const addRight = (right) => {
      if (!castling.includes(right)) {
        castling += right;
      }
    };

    if (lastMoveObj.piece === 'k') {
      if (movingColor === 'w') {
        addRight('K');
        addRight('Q');
      } else {
        addRight('k');
        addRight('q');
      }
    }

    if (lastMoveObj.piece === 'r') {
      if (lastMoveObj.from === 'a1') addRight('Q');
      if (lastMoveObj.from === 'h1') addRight('K');
      if (lastMoveObj.from === 'a8') addRight('q');
      if (lastMoveObj.from === 'h8') addRight('k');
    }

    if (lastMoveObj.captured === 'r') {
      if (lastMoveObj.to === 'a1') addRight('Q');
      if (lastMoveObj.to === 'h1') addRight('K');
      if (lastMoveObj.to === 'a8') addRight('q');
      if (lastMoveObj.to === 'h8') addRight('k');
    }

    if (castling === '') {
      castling = '-';
    }

    return [
      boardText,
      activeColor,
      castling,
      enPassant,
      parts[4],
      String(Math.max(1, Number(parts[5]) - (movingColor === 'w' ? 1 : 0))),
    ].join(' ');
  } catch (error) {
    console.warn('[AI Coach] Could not reconstruct FEN before move:', error);

    return null;
  }
}

/*
 * Clean model output.
 *
 * This is especially important for Gemma because occasionally it can
 * return a partial generation such as "Ц" or "чень)".
 */
function cleanComment(text, language) {
  if (!text) return '';

  let comment = String(text)
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // Прибираємо префікси відповідей
  comment = comment.replace(/^(?:answer|response|відповідь|comment|коментар)\s*:\s*/i, '').trim();

  // Видаляємо обірвані на кінці незавершені фрази на зразок "28..." або "Краще грати"
  comment = comment
    .replace(/(?:краще(?: було б)? грати|better was to play)\s*\d+\.{1,3}\s*$/iu, '')
    .trim();

  // Залишаємо тільки повні завершені речення (до 2 штук)
  const sentences = comment.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (sentences && sentences.length > 0) {
    comment = sentences.slice(0, 2).join(' ').trim();
  }

  return comment;
}

function buildSystemInstruction(language, playerColor) {
  if (language === 'en') {
    return `
You are a strong but concise chess coach.

The student is playing ${playerColor === 'white' ? 'WHITE' : 'BLACK'}.

Your job is to explain the student's move using the actual chess position provided in the user message.

RULES:

- Answer in English.
- Maximum 2 short sentences.
- Be concrete and chess-specific.
- If the move is inaccurate or a blunder, explicitly say so.
- For an inaccurate move or blunder, tell the student what would have been better.
- Give the concrete best alternative move in SAN when the position data is sufficient.
- Explain WHY that alternative is better.
- Never invent an alternative move when it is not supported by the position.
- If a best alternative is supplied by a chess engine, trust that engine move and explain it rather than replacing it.
- If the move is good, explain its main chess purpose.
- Do not give a fake reason just to fill space.
- Do not mention prompts, roles, instructions, context, AI, or reasoning.
- Do not output labels such as Role:, Task:, Context:, Requirements:, or Answer:.
- Do not output markdown lists or headings.
`.trim();
  }

  return `
Ти сильний, але лаконічний шаховий тренер.

Учень грає за ${playerColor === 'white' ? 'БІЛИХ' : 'ЧОРНИХ'}.

Твоє завдання — пояснити хід учня, використовуючи реальну шахову позицію з повідомлення користувача.

ПРАВИЛА:

- Відповідай українською.
- Максимум 2 коротких речення.
- Будь конкретним і говори саме про шахову позицію.
- Якщо хід неточний або є зівком, прямо скажи про це.
- Для неточного ходу або зівка скажи, що було б краще.
- Якщо даних позиції достатньо, назви конкретний кращий хід у SAN.
- Обов'язково поясни, ЧОМУ цей хід кращий.
- Не вигадуй альтернативний хід, якщо позиція не дає для нього достатньо підстав.
- Якщо кращий хід наданий шаховим движком, довірся йому та поясни його, а не вигадуй інший.
- Якщо хід хороший, поясни його головну шахову ідею.
- Не вигадуй проблему лише заради того, щоб щось сказати.
- Не згадуй prompt, роль, інструкції, контекст, AI або свої міркування.
- Не виводь слова Role:, Task:, Context:, Requirements: або Answer:.
- Не використовуй списки чи заголовки.
`.trim();
}

function buildUserPrompt({
  language,
  fullMoveText,
  sideText,
  moveDetailsText,
  evalBefore,
  evalAfter,
  leadText,
  moveQuality,
  myPieces,
  fenAfter,
  fenBefore,
  engineBestMove,
  engineBestMoveSan,
  engineEvaluationBefore,
}) {
  const qualityIsBad =
    moveQuality.includes('blunder') ||
    moveQuality.includes('inaccuracy') ||
    moveQuality.includes('слаб') ||
    moveQuality.includes('неточ') ||
    moveQuality.includes('зівок');

  const bestMoveText = engineBestMoveSan || engineBestMove;

  if (language === 'en') {
    return `
Chess move: ${fullMoveText}
Side: ${sideText}
Action: ${moveDetailsText}

Move quality: ${moveQuality}

Evaluation before: ${evalBefore}
Evaluation after: ${evalAfter}

Position status: ${leadText}

Student pieces: ${myPieces.join(', ')}

FEN after the move:
${fenAfter}

FEN before the move:
${fenBefore || 'Not available'}

Engine best move before the student's move:
${bestMoveText || 'Not provided'}

Engine evaluation before the student's move:
${engineEvaluationBefore ?? 'Not provided'}

${
  qualityIsBad
    ? 'This move was judged inaccurate or bad. Explain the mistake, give the better move if it is supported by the supplied position/engine data, and explain why it is better.'
    : 'Explain the main purpose and chess idea of this move. If it is actually a mistake despite the supplied quality label, prioritize the position and explain the concrete problem.'
}
`.trim();
  }

  return `
Шаховий хід: ${fullMoveText}
Сторона: ${sideText}
Дія: ${moveDetailsText}

Якість ходу: ${moveQuality}

Оцінка до ходу: ${evalBefore}
Оцінка після ходу: ${evalAfter}

Стан позиції: ${leadText}

Фігури учня: ${myPieces.join(', ')}

FEN після ходу:
${fenAfter}

FEN до ходу:
${fenBefore || 'Недоступний'}

Кращий хід движка до ходу учня:
${bestMoveText || 'Не наданий'}

Оцінка движка до ходу:
${engineEvaluationBefore ?? 'Не надана'}

${
  qualityIsBad
    ? 'Цей хід визначено як неточний або поганий. Поясни помилку, назви кращий хід, якщо він підтверджується позицією/даними движка, і поясни, чому він кращий.'
    : 'Поясни головну мету та шахову ідею цього ходу. Якщо попри оцінку хід насправді має конкретну проблему, поясни її на основі позиції.'
}
`.trim();
}

function isClearlyBrokenResponse(text) {
  if (!text) {
    return true;
  }

  const cleaned = String(text).trim();

  const normalized = cleaned.replace(/[^\p{L}\p{N}]/gu, '');

  /*
   * Reject extremely short generations.
   */
  if (normalized.length < 12) {
    return true;
  }

  /*
   * Known examples of broken generations.
   */
  const brokenPatterns = [/^\s*[Цц]\s*$/u, /^\s*чень\)\s*["']?\.?\s*$/iu, /^\s*\W{0,3}\s*$/u];

  if (brokenPatterns.some((pattern) => pattern.test(cleaned))) {
    return true;
  }

  /*
   * Reject metadata-style output.
   */
  const lower = cleaned.toLowerCase();

  const metaMarkers = ['role:', 'task:', 'language:', 'context:', 'requirements:'];

  const metaCount = metaMarkers.filter((marker) => lower.includes(marker)).length;

  return metaCount >= 2;
}

async function generateWithModel({ ai, modelName, systemInstruction, userPrompt }) {
  const config = {
    systemInstruction,
    maxOutputTokens: 250,
  };

  /*
   * Gemma 4 has explicit thinking-level control.
   *
   * This task is very short, so minimal thinking is enough.
   */
  if (GEMMA_MODELS.has(modelName)) {
    config.thinkingConfig = {
      thinkingLevel: 'minimal',
    };
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: userPrompt,
    config,
  });

  return response?.text?.trim() || '';
}

export async function explainMove({
  move,
  lastMoveObj,
  evalBefore,
  evalAfter,
  fen,
  fenBefore = null,
  isPlayerMove,
  playerColor,
  userGeminiKey,
  language = 'uk',

  /*
   * Optional engine data.
   *
   * Existing callers do NOT have to provide these.
   *
   * If you already have Stockfish best move data, pass:
   *
   * bestMoveSan: 'Nf3'
   *
   * or:
   *
   * engineBestMoveSan: 'Nf3'
   */
  bestMove = null,
  bestMoveSan = null,
  engineBestMove = null,
  engineBestMoveSan = null,
  engineEvaluationBefore = null,
}) {
  const lang = language === 'en' ? 'en' : 'uk';

  const names = pieceNames[lang];

  if (!userGeminiKey) {
    return {
      moveText: move,
      comment: lang === 'en' ? '⚠️ Set your Gemini API key.' : '⚠️ Встанови свій Gemini API ключ.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: userGeminiKey,
    });

    /*
     * IMPORTANT:
     *
     * The supplied FEN is normally the position AFTER the move.
     */
    const chess = new Chess(fen);

    const currentTurn = chess.turn();

    /*
     * If it is BLACK's turn now, WHITE just moved.
     */
    const isWhiteMove = currentTurn === 'b';

    let moveNumber = chess.moveNumber();

    if (!isWhiteMove) {
      moveNumber -= 1;
    }

    let moveSan = move;

    let pieceName = lang === 'en' ? 'piece' : 'фігура';

    let moveDetailsText = move;

    if (lastMoveObj) {
      moveSan = lastMoveObj.san || move;

      pieceName = names[lastMoveObj.piece] || pieceName;

      const captureText = lastMoveObj.captured
        ? lang === 'en'
          ? ` (captured ${names[lastMoveObj.captured]})`
          : ` (збито ${names[lastMoveObj.captured]})`
        : '';

      moveDetailsText =
        lang === 'en'
          ? `${pieceName.charAt(0).toUpperCase() + pieceName.slice(1)} from ${lastMoveObj.from} moved to ${lastMoveObj.to}${captureText}`
          : `${pieceName.toUpperCase()} з поля ${lastMoveObj.from} перемістився на ${lastMoveObj.to}${captureText}`;
    }

    /*
     * Collect student's pieces.
     */
    const myPieces = [];

    const board = chess.board();

    const myColorChar = playerColor === 'white' ? 'w' : 'b';

    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.color === myColorChar) {
          myPieces.push(names[cell.type]);
        }
      }
    }

    /*
     * Evaluation difference.
     */
    const evalDiffNum = parseFloat((evalAfter - evalBefore).toFixed(2));

    const sideText = isPlayerMove
      ? lang === 'en'
        ? 'Player (Student)'
        : 'Гравець (Учень)'
      : lang === 'en'
        ? 'Bot-opponent'
        : 'Бот-суперник';

    /*
     * Adjust evaluation severity.
     */
    let effectiveDiff = evalDiffNum;

    const playerEvalBefore = playerColor === 'white' ? evalBefore : -evalBefore;

    if (playerEvalBefore > 3.0 && effectiveDiff < 0) {
      effectiveDiff /= 2;
    } else if (playerEvalBefore < -3.0 && effectiveDiff < 0) {
      effectiveDiff /= 3;
    }

    /*
     * Determine move quality.
     */
    let moveQuality = lang === 'en' ? 'good or standard move' : 'хороший або стандартний хід';

    if (effectiveDiff <= -1.5) {
      moveQuality = lang === 'en' ? 'blunder' : 'груба помилка (зівок)';
    } else if (effectiveDiff <= -0.7) {
      moveQuality = lang === 'en' ? 'inaccuracy or weaker move' : 'неточність або слабший хід';
    } else if (Math.abs(effectiveDiff) < 0.5) {
      moveQuality = lang === 'en' ? 'equal move' : 'рівний хід';
    } else if (effectiveDiff >= 0.8) {
      moveQuality = lang === 'en' ? 'very strong move' : 'дуже сильний хід';
    }

    /*
     * Position status.
     */
    let leadText = lang === 'en' ? 'Equal position' : 'Рівна позиція';

    if (evalAfter >= 2.0) {
      leadText = lang === 'en' ? 'White is dominating' : 'Білі домінують';
    } else if (evalAfter <= -2.0) {
      leadText = lang === 'en' ? 'Black is dominating' : 'Чорні домінують';
    }

    const formattedMoveNumber = isWhiteMove ? `${moveNumber}.` : `${moveNumber}...`;

    const fullMoveText = `${formattedMoveNumber} ${moveSan}`;

    /*
     * Prefer a real FEN before the move if supplied.
     *
     * Otherwise try to reconstruct it.
     */
    const actualFenBefore = fenBefore || reconstructFenBefore(fen, lastMoveObj);

    /*
     * Prefer explicitly supplied engine data.
     */
    const actualBestMove = engineBestMove || bestMove || null;

    const actualBestMoveSan = engineBestMoveSan || bestMoveSan || null;

    const systemInstruction = buildSystemInstruction(lang, playerColor);

    const userPrompt = buildUserPrompt({
      language: lang,
      fullMoveText,
      sideText,
      moveDetailsText,
      evalBefore,
      evalAfter,
      leadText,
      moveQuality,
      myPieces,
      fenAfter: fen,
      fenBefore: actualFenBefore,
      engineBestMove: actualBestMove,
      engineBestMoveSan: actualBestMoveSan,
      engineEvaluationBefore,
    });

    let comment = '';

    /*
     * Try models sequentially.
     */
    for (const modelName of MODELS_FALLBACK_LIST) {
      try {
        console.log(`[AI Coach] Trying model: ${modelName}`);

        comment = await generateWithModel({
          ai,
          modelName,
          systemInstruction,
          userPrompt,
        });

        comment = cleanComment(comment, lang);

        /*
         * If Gemma returns a broken/partial response,
         * retry once with a stricter prompt.
         */
        if (isClearlyBrokenResponse(comment)) {
          console.warn(`[AI Coach] Invalid/partial response from ${modelName}. Retrying...`);

          const retryPrompt =
            lang === 'en'
              ? `
Answer the chess question below directly.

Return ONLY 1-2 complete English sentences.

Do not repeat the task.
Do not mention instructions.
Do not describe the prompt.

If the move is bad, explicitly say so.
If a better move is supplied by the engine, name it and explain why it is better.

${userPrompt}
`.trim()
              : `
Відповідай безпосередньо на шахове питання нижче.

Поверни ТІЛЬКИ 1-2 повні речення українською.

Не повторюй завдання.
Не згадуй інструкції.
Не описуй prompt.
Не описуй свою роль.

Якщо хід поганий, прямо скажи про це.
Якщо движок надав кращий хід, назви його та поясни, чому він кращий.

${userPrompt}
`.trim();

          comment = await generateWithModel({
            ai,
            modelName,
            systemInstruction,
            userPrompt: retryPrompt,
          });

          comment = cleanComment(comment, lang);
        }

        /*
         * Only accept a response if it is clearly usable.
         */
        if (!isClearlyBrokenResponse(comment)) {
          console.log(`[AI Coach] Success with model: ${modelName}`);

          break;
        }

        comment = '';
      } catch (err) {
        console.warn(`[AI Coach] Error with ${modelName}, switching to next model...`, err);

        comment = '';
      }
    }

    return {
      moveText: fullMoveText,

      comment:
        comment ||
        (lang === 'en' ? 'Continuing positional play.' : 'Продовжуємо позиційну боротьбу.'),
    };
  } catch (error) {
    console.error('[AI Coach] Fatal error:', error);

    return {
      moveText: move,

      comment:
        lang === 'en' ? '⚠️ Failed to generate a comment.' : '⚠️ Не вдалося згенерувати коментар.',
    };
  }
}
