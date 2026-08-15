import { Chess } from 'chess.js';
import { evaluatePosition } from './stockfish.js';
import { explainMove } from './aiCoach.js';
import { User } from '../models/User.js';
import { GameLog } from '../models/GameLog.js';
import { decrypt } from '../utils/crypto.js';

const activeGameStreams = new Set();
// Save history of FENs and moves for final recalculation
const gameHistoryMap = new Map();

// Formula for winning chances (Lichess Winning Chances)
function getWinChance(cp) {
  // Limit cp values to protect against infinity in mate situations
  const cappedCp = Math.max(-1000, Math.min(1000, cp * 100));
  return 1 / (1 + Math.exp(-0.0036824 * cappedCp));
}

function getUserLanguage(user) {
  return user?.language === 'en' ? 'en' : 'uk';
}

export async function listenLichessEvents(chatId, token, bot, signal) {
  bot.on('callback_query', async (query) => {
    if (!query.data || !query.data.startsWith('delete_game_msgs:')) return;

    const gameId = query.data.split(':')[1];

    try {
      const user = await User.findOne({ chatId });
      const language = getUserLanguage(user);
      const log = await GameLog.findOne({ gameId, chatId });
      if (log && log.messageIds.length > 0) {
        for (const msgId of log.messageIds) {
          try {
            await bot.deleteMessage(chatId, msgId);
          } catch (e) {}
        }
        await GameLog.deleteOne({ _id: log._id });
      } else {
        try {
          await bot.deleteMessage(chatId, query.message.message_id);
        } catch (e) {}
      }
      await bot.answerCallbackQuery(query.id, {
        text: language === 'en' ? 'Game history deleted!' : 'Історію гри видалено!',
      });
    } catch (err) {
      console.error('Error deleting game messages:', err);
    }
  });

  const pollInterval = setInterval(async () => {
    if (signal.aborted) {
      clearInterval(pollInterval);
      return;
    }
    await checkActiveGames(chatId, token, bot, signal);
  }, 3000);

  await checkActiveGames(chatId, token, bot, signal);

  try {
    const response = await fetch('https://lichess.org/api/stream/event', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!response.ok) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'gameStart') {
            const gameId = event.game?.id;
            if (gameId && !activeGameStreams.has(gameId)) {
              startTrackingGame(chatId, gameId, token, bot, signal);
            }
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    clearInterval(pollInterval);
  }
}

async function checkActiveGames(chatId, token, bot, signal) {
  try {
    const res = await fetch('https://lichess.org/api/account/playing', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!res.ok) return;

    const data = await res.json();
    const nowPlaying = data.nowPlaying || [];

    for (const game of nowPlaying) {
      if (!activeGameStreams.has(game.gameId)) {
        startTrackingGame(chatId, game.gameId, token, bot, signal);
      }
    }
  } catch (e) {}
}

async function startTrackingGame(chatId, gameId, token, bot, signal) {
  activeGameStreams.add(gameId);
  gameHistoryMap.set(gameId, { fens: [], openingName: null });

  const user = await User.findOne({ chatId });
  const language = getUserLanguage(user);

  await GameLog.findOneAndUpdate(
    { gameId, chatId },
    { $setOnInsert: { messageIds: [] } },
    { upsert: true }
  );

  const msg = await bot.sendMessage(
    chatId,
    language === 'en'
      ? `🎮 **Game analysis started!**\nGame ID: \`${gameId}\`\nAnalyzing moves...`
      : `🎮 **Розпочато аналіз партії!**\nID гри: \`${gameId}\`\nАналізую ходи...`,
    { parse_mode: 'Markdown' }
  );

  await trackMessage(gameId, chatId, msg.message_id);
  streamGameMoves(chatId, gameId, token, bot, signal);
}

async function trackMessage(gameId, chatId, messageId) {
  try {
    await GameLog.updateOne({ gameId, chatId }, { $addToSet: { messageIds: messageId } });
  } catch (e) {}
}

async function streamGameMoves(chatId, gameId, token, bot, signal) {
  try {
    const response = await fetch(`https://lichess.org/api/board/game/stream/${gameId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!response.ok) {
      activeGameStreams.delete(gameId);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const chess = new Chess();
    let lastHandledMoveCount = 0;
    let previousEval = 0.2;
    let playerColor = 'white';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);

          if (data.type === 'gameFull' || data.type === 'gameState') {
            const state = data.type === 'gameFull' ? data.state : data;

            if (data.type === 'gameFull') {
              if (
                data.white?.aiLevel !== undefined ||
                data.white?.title === 'BOT' ||
                data.white?.name === 'Stockfish'
              ) {
                playerColor = 'black';
              } else {
                playerColor = 'white';
              }
              if (data.opening?.name) {
                const historyData = gameHistoryMap.get(gameId);
                if (historyData) historyData.openingName = data.opening.name;
              }
            }

            // End of game handling and deep recalculation
            if (state.status && state.status !== 'started') {
              activeGameStreams.delete(gameId);

             const user = await User.findOne({ chatId });
             const language = getUserLanguage(user);

             const winner = state.winner
               ? state.winner === playerColor
                 ? language === 'en'
                   ? 'Victory! 🎉'
                   : 'Перемога! 🎉'
                 : language === 'en'
                   ? 'Defeat 💔'
                   : 'Поразка 💔'
               : language === 'en'
                 ? 'Draw 🤝'
                 : 'Нічия 🤝';

             const historyData = gameHistoryMap.get(gameId) || { fens: [], openingName: null };

             // Try to get the official analysis from Lichess first
             let finalOpening = historyData.openingName;
             let hasLichessAnalysis = false;
             let accuracy = null;
             let avgCpl = null;
             let inaccuracies = 0;
             let mistakes = 0;
             let blunders = 0;

             try {
               const gameRes = await fetch(
                 `https://lichess.org/game/export/${gameId}?evals=true&opening=true`,
                 {
                   headers: { Accept: 'application/json' },
                 }
               );
               if (gameRes.ok) {
                 const gameJson = await gameRes.json();
                 finalOpening = gameJson.opening?.name || finalOpening || (language === 'en' ? 'Main opening' : 'Основний дебют');
                 const isWhite = playerColor === 'white';
                 const playerData = isWhite ? gameJson.players?.white : gameJson.players?.black;

                 if (playerData && playerData.analysis) {
                   hasLichessAnalysis = true;
                   inaccuracies = playerData.analysis.inaccuracy ?? 0;
                   mistakes = playerData.analysis.mistake ?? 0;
                   blunders = playerData.analysis.blunder ?? 0;
                   avgCpl = playerData.analysis.acpl ?? 0;
                   accuracy = playerData.accuracy ?? null;
                 }
               }
             } catch (e) {}

             // If there is no Lichess analysis — PERFORM A DEEP REEVALUATION AT DEPTH 18
             if (!hasLichessAnalysis && historyData.fens.length > 0) {
               const calculatingMsg = await bot.sendMessage(
                 chatId,
                 language === 'en'
                   ? '⏳ *Performing deep final game analysis (Stockfish Depth 18)...*'
                   : '⏳ *Проводжу глибокий підсумковий аналіз партії (Stockfish Depth 18)...*',
                 { parse_mode: 'Markdown' }
               );

               let totalLoss = 0;
               let playerMoveCount = 0;

               for (let i = 0; i < historyData.fens.length; i++) {
                 const item = historyData.fens[i];
                 if (!item.isPlayerMove) continue;

                 // Evaluation BEFORE and AFTER the move at depth 18
                 const evalBefore18 = await evaluatePosition(item.fenBefore, 18);
                 const evalAfter18 = await evaluatePosition(item.fenAfter, 18);

                 const isWhite = playerColor === 'white';
                 const pEvalBefore = isWhite ? evalBefore18 : -evalBefore18;
                 const pEvalAfter = isWhite ? evalAfter18 : -evalAfter18;

                 const winBefore = getWinChance(pEvalBefore);
                 const winAfter = getWinChance(pEvalAfter);

                 const winDrop = winBefore - winAfter; // Loss of winning chances
                 const cplLoss = Math.max(0, pEvalBefore - pEvalAfter);

                 totalLoss += cplLoss;
                 playerMoveCount++;

                 // Classification by Lichess Winning Chances method
                 if (winDrop >= 0.2) blunders++;
                 else if (winDrop >= 0.1) mistakes++;
                 else if (winDrop >= 0.05) inaccuracies++;
               }

               avgCpl = playerMoveCount > 0 ? Math.round((totalLoss / playerMoveCount) * 100) : 0;
               accuracy = Math.max(1, Math.min(100, Math.round(100 - avgCpl / 2.5)));

               try {
                 await bot.deleteMessage(chatId, calculatingMsg.message_id);
               } catch (e) {}
             }

             if (!finalOpening) finalOpening = language === 'en' ? 'Main opening' : 'Основний дебют';

             const finishMsg = await bot.sendMessage(
               chatId,
               (language === 'en'
                 ? `🏁 **Game finished!**\n\n` +
                   `📌 **Result:** ${winner} (${state.status})\n` +
                   `📖 **Opening:** \`${finalOpening}\`\n\n` +
                   `🎯 **Accuracy:** \`${accuracy ?? 85}%\`\n` +
                   `📉 **CPL (average loss):** \`${avgCpl ?? 30}\` cp\n\n` +
                   `📊 **Move analysis ${hasLichessAnalysis ? '(Lichess)' : '(Stockfish Depth 18)'}:**\n` +
                   `• 🟡 Inaccuracies: \`${inaccuracies}\`\n` +
                   `• 🟠 Mistakes: \`${mistakes}\`\n` +
                   `• 🔴 Blunders: \`${blunders}\`\n\n` +
                   `♟ **Final evaluation:** \`${previousEval > 0 ? '+' + previousEval : previousEval}\``
                 : `🏁 **Партія завершена!**\n\n` +
                   `📌 **Результат:** ${winner} (${state.status})\n` +
                   `📖 **Дебют:** \`${finalOpening}\`\n\n` +
                   `🎯 **Точність:** \`${accuracy ?? 85}%\`\n` +
                   `📉 **CPL (середня втрата):** \`${avgCpl ?? 30}\` cp\n\n` +
                   `📊 **Аналіз ходів ${hasLichessAnalysis ? '(Lichess)' : '(Stockfish Depth 18)'}:**\n` +
                   `• 🟡 Неточності: \`${inaccuracies}\`\n` +
                   `• 🟠 Помилки: \`${mistakes}\`\n` +
                   `• 🔴 Грубі зівки: \`${blunders}\`\n\n` +
                   `♟ **Фінальна оцінка:** \`${previousEval > 0 ? '+' + previousEval : previousEval}\``),
               {
                 parse_mode: 'Markdown',
                 reply_markup: {
                   inline_keyboard: [
                     [
                       {
                         text: language === 'en' ? '🗑 Delete this game history' : '🗑 Видалити історію цієї гри',
                         callback_data: `delete_game_msgs:${gameId}`,
                       },
                     ],
                   ],
                 },
               }
             );

              await trackMessage(gameId, chatId, finishMsg.message_id);
              gameHistoryMap.delete(gameId);
              return;
            }

            const movesString = state.moves ? state.moves.trim() : '';
            const movesList = movesString ? movesString.split(' ') : [];

            if (movesList.length > lastHandledMoveCount) {
              const rawMove = movesList[movesList.length - 1];

              const fenBefore = chess.fen();

              chess.reset();
              for (const m of movesList) {
                try {
                  chess.move(m, { sloppy: true });
                } catch (e) {}
              }

              const currentFen = chess.fen();
              const history = chess.history({ verbose: true });
              const lastMoveObj = history.length > 0 ? history[history.length - 1] : null;

              const lastMoveColor = chess.turn() === 'b' ? 'white' : 'black';
              const isPlayerMove = lastMoveColor === playerColor;

              // Fast evaluation for the live stream (depth 12)
              const currentEval = await evaluatePosition(currentFen, 12);

              // Save FEN snapshots for the final deep analysis at game end
              const historyData = gameHistoryMap.get(gameId);
              if (historyData) {
                historyData.fens.push({
                  fenBefore,
                  fenAfter: currentFen,
                  isPlayerMove,
                });
              }

              let userGeminiKey = null;
              try {
                const user = await User.findOne({ chatId });
                if (user && user.geminiKey && user.geminiKey.content) {
                  userGeminiKey = decrypt(user.geminiKey);
                }
              } catch (e) {}

              const user = await User.findOne({ chatId });
              const language = getUserLanguage(user);

              const { moveText, comment } = await explainMove({
                move: rawMove,
                lastMoveObj,
                evalBefore: previousEval,
                evalAfter: currentEval,
                fen: currentFen,
                isPlayerMove,
                playerColor,
                userGeminiKey,
                language,
              });

              const evalSign = currentEval > 0 ? `+${currentEval}` : `${currentEval}`;

              const msg = await bot.sendMessage(
                chatId,
                language === 'en'
                  ? `♟ **Move:** \`${moveText}\` | **Eval:** \`${evalSign}\`\n💬 ${comment}`
                  : `♟ **Хід:** \`${moveText}\` | **Оцінка:** \`${evalSign}\`\n💬 ${comment}`,
                { parse_mode: 'Markdown' }
              );

              await trackMessage(gameId, chatId, msg.message_id);

              previousEval = currentEval;
              lastHandledMoveCount = movesList.length;
            }
          }
        } catch (e) {
          console.error('Stream error:', e);
        }
      }
    }
  } catch (err) {
    activeGameStreams.delete(gameId);
  }
}
