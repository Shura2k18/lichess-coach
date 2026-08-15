import { spawn } from 'child_process';
import fs from 'fs';

function getStockfishPath() {
  if (fs.existsSync('/usr/games/stockfish')) return '/usr/games/stockfish';
  if (fs.existsSync('/usr/bin/stockfish')) return '/usr/bin/stockfish';
  if (fs.existsSync('/usr/local/bin/stockfish')) return '/usr/local/bin/stockfish';
  return 'stockfish';
}

export function evaluatePosition(fen, depth = 14) {
  // Increased depth to 14
  return new Promise((resolve) => {
    let lastEval = 0;
    const stockfishExecutable = getStockfishPath();

    let engine;
    try {
      engine = spawn(stockfishExecutable);
    } catch (e) {
      console.error('Error starting Stockfish:', e.message);
      return resolve(0);
    }

    engine.on('error', () => resolve(0));

    engine.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        if (line.startsWith('info') && line.includes('score')) {
          if (line.includes('score cp')) {
            const cpMatch = line.match(/score cp (-?\d+)/);
            if (cpMatch) {
              lastEval = parseInt(cpMatch[1], 10) / 100;
            }
          } else if (line.includes('score mate')) {
            const mateMatch = line.match(/score mate (-?\d+)/);
            if (mateMatch) {
              const movesToMate = parseInt(mateMatch[1], 10);
              // Cap mate values to +10.0 / -10.0 for reasonable CPL calculation
              lastEval = movesToMate > 0 ? 10.0 : -10.0;
            }
          }
        }

        if (line.includes('bestmove')) {
          engine.stdin.write('quit\n');
          engine.kill();

          const isBlackToMove = fen.split(' ')[1] === 'b';
          const normalizedEval = isBlackToMove ? -lastEval : lastEval;
          resolve(normalizedEval);
        }
      }
    });

    engine.stdin.write('uci\n');
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${depth}\n`);
  });
}
