import express from 'express';
import { Chess } from 'chess.js';
import { evaluatePosition } from '../services/stockfish.js';
import { explainMove } from '../services/aiCoach.js';

const router = express.Router();

function cleanMoveString(raw) {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    .replace(/^\d+(\.{1,3})?\s*/, '')
    .replace(/♘|♞/g, 'N')
    .replace(/♗|♝/g, 'B')
    .replace(/♖|♜/g, 'R')
    .replace(/♕|♛/g, 'Q')
    .replace(/♔|♚/g, 'K')
    .trim();
}

router.post('/analyze-move', async (req, res) => {
  try {
    const { movesHistory, rawMove, playerColor = 'white', userGeminiKey, language = 'uk' } = req.body;

    if (!rawMove || !userGeminiKey) {
      const errorMessage = language === 'en' ? 'Required fields: rawMove, userGeminiKey' : 'Обов\'язкові поля: rawMove, userGeminiKey';
      return res.status(400).json({ error: errorMessage });
    }

    const safeMoves = Array.isArray(movesHistory)
      ? movesHistory
      : typeof movesHistory === 'string'
        ? [movesHistory]
        : [];

    const chess = new Chess();
    const appliedMoves = [];

    for (const m of safeMoves) {
      const cleaned = cleanMoveString(m);
      if (!cleaned) continue;

      try {
        const result = chess.move(cleaned, { sloppy: true });
        if (result) {
          appliedMoves.push(result.san);
        }
      } catch (e) {
        const possibleMoves = chess.moves({ verbose: true });
        const matched = possibleMoves.find((pm) => pm.san === cleaned || pm.to === cleaned);
        if (matched) {
          chess.move(matched);
          appliedMoves.push(matched.san);
        }
      }
    }

    const currentFen = chess.fen();
    console.log(`[AI Coach] Calculated FEN: ${currentFen}`);

    const history = chess.history({ verbose: true });
    const lastMoveObj = history.length > 0 ? history[history.length - 1] : null;

    let currentEval = 0;
    const isCheckmate = rawMove.includes('#') || chess.isCheckmate();

    if (isCheckmate) {
      currentEval = '#M';
    } else {
      try {
        currentEval = await evaluatePosition(currentFen, 12);
      } catch (e) {
        console.error('Stockfish error:', e.message);
      }
    }

    const cleanRaw = cleanMoveString(rawMove);

    // AI Analysis
    const aiResult = await explainMove({
      move: cleanRaw || rawMove,
      lastMoveObj,
      evalBefore: isCheckmate ? '#M' : currentEval,
      evalAfter: isCheckmate ? '#M' : currentEval,
      fen: currentFen,
      isPlayerMove: true,
      playerColor,
      userGeminiKey,
      language,
    });

    return res.json({
      success: true,
      moveText: cleanRaw || rawMove,
      evaluation: currentEval,
      comment: aiResult.comment,
    });
  } catch (error) {
    console.error('❌ Critical error in route /api/analyze-move:', error);
    const language = req.body?.language;
    const serverError = language === 'en' ? 'Internal server error' : 'Внутрішня помилка сервера';
    return res.status(500).json({ error: error.message || serverError });
  }
});

export default router;
