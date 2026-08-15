import { GoogleGenerativeAI } from '@google/generative-ai';
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

// Priority list of models based on your list
const MODELS_FALLBACK_LIST = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemma-4-26b',
  'gemma-4-31b',
];

export async function explainMove({
  move,
  lastMoveObj,
  evalBefore,
  evalAfter,
  fen,
  isPlayerMove,
  playerColor,
  userGeminiKey,
  language = 'uk',
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
    const genAI = new GoogleGenerativeAI(userGeminiKey);
    const chess = new Chess(fen);

    const currentTurn = chess.turn();
    const isWhiteMove = currentTurn === 'b';

    let moveNumber = chess.moveNumber();
    if (!isWhiteMove) {
      moveNumber -= 1;
    }

    let moveSan = move;
    let pieceName = lang === 'en' ? 'piece' : 'фігура';
    let moveDetailsText = move;

    if (lastMoveObj) {
      moveSan = lastMoveObj.san;
      pieceName = names[lastMoveObj.piece] || (lang === 'en' ? 'piece' : 'фігура');
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

    const evalDiffNum = parseFloat((evalAfter - evalBefore).toFixed(2));
    const sideText = isPlayerMove
      ? lang === 'en'
        ? 'Player (Student)'
        : 'Гравець (Учень)'
      : lang === 'en'
        ? 'Bot-opponent'
        : 'Бот-суперник';

    let effectiveDiff = evalDiffNum;
    const playerEvalBefore = playerColor === 'white' ? evalBefore : -evalBefore;

    if (playerEvalBefore > 3.0 && effectiveDiff < 0) {
      effectiveDiff = effectiveDiff / 2;
    } else if (playerEvalBefore < -3.0 && effectiveDiff < 0) {
      effectiveDiff = effectiveDiff / 3;
    }

    let moveQuality = lang === 'en' ? 'good or standard move' : 'хороший або стандартний хід';
    if (effectiveDiff <= -1.5) moveQuality = lang === 'en' ? 'blunder' : 'груба помилка (зівок)';
    else if (effectiveDiff <= -0.7) moveQuality = lang === 'en' ? 'inaccuracy or weaker move' : 'неточність або слабший хід';
    else if (Math.abs(effectiveDiff) < 0.5) moveQuality = lang === 'en' ? 'equal move' : 'рівний хід';
    else if (effectiveDiff >= 0.8) moveQuality = lang === 'en' ? 'very strong move' : 'дуже сильний хід';

    let leadText = lang === 'en' ? 'Equal position' : 'Рівна позиція';
    if (evalAfter >= 2.0) leadText = lang === 'en' ? 'White is dominating' : 'Білі домінують';
    else if (evalAfter <= -2.0) leadText = lang === 'en' ? 'Black is dominating' : 'Чорні домінують';

    const formattedMoveNumber = isWhiteMove ? `${moveNumber}.` : `${moveNumber}...`;
    const fullMoveText = `${formattedMoveNumber} ${moveSan}`;

    const prompt =
      lang === 'en'
        ? `You are a fast chess coach. The student is playing as ${playerColor === 'white' ? 'WHITE' : 'BLACK'}.
Move: ${fullMoveText} (${sideText}).
Action: ${moveDetailsText}.
Evaluation: ${evalAfter > 0 ? '+' + evalAfter : evalAfter} (${leadText}).
Quality: ${moveQuality}.
Student pieces: ${myPieces.join(', ')}.

REQUIREMENTS:
1. No preamble, no thinking, no introduction. Give only a direct answer.
2. Explain the point or mistake of the move in at most 1-2 short sentences in English.
3. Do not provide exact coordinates for alternative moves (d5, Nf3, etc.), suggest general ideas only.`
        : `Ти — швидкий шаховий тренер. Учень грає за ${playerColor === 'white' ? 'БІЛИХ' : 'ЧОРНИХ'}.
Хід: ${fullMoveText} (${sideText}).
Дія: ${moveDetailsText}.
Оцінка: ${evalAfter > 0 ? '+' + evalAfter : evalAfter} (${leadText}).
Якість: ${moveQuality}.
Фігури учня: ${myPieces.join(', ')}.

ВИМОГИ:
1. Без жодних преамбул, роздумів чи вступу. Дай тільки пряму відповідь.
2. Поясни суть або помилку ходу максимум у 1-2 коротких реченнях українською мовою.
3. Не пиши точні координати альтернативних ходів (d5, Nf3 тощо), радь загальні ідеї.`;

    let comment = '';

    // Iterate through models sequentially
    for (const modelName of MODELS_FALLBACK_LIST) {
      try {
        const isGemini = modelName.startsWith('gemini');
        
        const generationConfig = {
          temperature: 0.3,
          maxOutputTokens: 70,
          ...(isGemini && { thinkingConfig: { thinkingBudget: 0 } }),
        };

        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig,
        });

        const result = await model.generateContent(prompt);
        comment = result.response.text().trim();

        if (comment) break;
      } catch (err) {
        console.warn(`[AI Coach] Error for ${modelName}:`, err.message || err);
      }
    }

    return {
      moveText: fullMoveText,
      comment: comment || (lang === 'en' ? 'Continuing positional play.' : 'Продовжуємо позиційну боротьбу.'),
    };
  } catch (error) {
    return {
      moveText: move,
      comment: lang === 'en' ? '⚠️ Failed to generate a comment.' : '⚠️ Не вдалося згенерувати коментар.',
    };
  }
}
