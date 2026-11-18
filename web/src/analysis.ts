import { Chess } from 'chess.js';
import { MATE, parseClock, scorePlies, type GameRow, type MoveRow } from './core';
import { Engine } from './engine';

function terminalEval(game: Chess): number | undefined {
  if (game.isCheckmate()) return game.turn() === 'w' ? -MATE : MATE;
  if (game.isGameOver()) return 0;
  return undefined;
}

export async function analyzeGame(row: GameRow, engine: Engine, depth: number): Promise<MoveRow[]> {
  const game = new Chess();
  game.loadPgn(row.pgn);
  const clocks = new Map(game.getComments().map((c) => [c.fen, parseClock(c.comment)]));
  const history = game.history({ verbose: true });
  const board = new Chess();
  if (history[0]) board.load(history[0].before);

  const plies: Parameters<typeof scorePlies>[0] = [];
  const evals: number[] = [];
  for (const [i, mv] of history.entries()) {
    const { cp, bestUci } = await engine.analyse(mv.before, depth);
    const white = mv.color === 'w';
    evals.push(white ? cp : -cp);
    let bestSan: string | undefined;
    if (bestUci) {
      bestSan = new Chess(mv.before).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }).san;
    }
    plies.push({
      gameId: row.id, ply: i + 1, color: white ? 'white' : 'black', san: mv.san, uci: mv.lan,
      fenBefore: mv.before, clockSeconds: clocks.get(mv.after), bestUci, bestSan,
    });
    board.move(mv.san);
  }
  let final = terminalEval(board);
  if (final === undefined) {
    const { cp } = await engine.analyse(board.fen(), depth);
    final = board.turn() === 'w' ? cp : -cp;
  }
  evals.push(final);
  return scorePlies(plies, evals);
}
