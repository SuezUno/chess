// Pure logic shared by sync and analysis (no browser APIs here, so it is unit-testable).

export const MATE = 10000;

export interface GameRow {
  id: string;               // `${accountId}:${platformGameId}`
  accountId: string;        // `chesscom:${username}`
  platformGameId: string;
  url?: string;
  timeClass?: string;
  timeControl?: string;
  rated: boolean;
  rules?: string;
  endTime: number;          // unix seconds
  userColor: 'white' | 'black';
  userRating?: number;
  opponent?: string;
  opponentRating?: number;
  result: 'win' | 'loss' | 'draw';
  resultDetail?: string;
  eco?: string;
  opening?: string;
  pgn: string;
  analyzedAt?: string;
  analysisDepth?: number;
}

export interface MoveRow {
  gameId: string;
  ply: number;              // 1 = white's first move
  color: 'white' | 'black';
  san: string;
  uci: string;
  fenBefore: string;
  clockSeconds?: number;
  evalBefore: number;       // centipawns, white's point of view (mate = +-MATE)
  evalAfter: number;
  bestUci?: string;
  bestSan?: string;
  winBefore: number;        // mover's win chance 0-100
  winAfter: number;
  classification?: 'inaccuracy' | 'mistake' | 'blunder';
}

const DRAW_CODES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

/** Lichess' win-chance curve, mover's point of view. */
export function winChance(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function classify(drop: number): MoveRow['classification'] {
  if (drop >= 30) return 'blunder';
  if (drop >= 20) return 'mistake';
  if (drop >= 10) return 'inaccuracy';
  return undefined;
}

export function parseChesscomGame(raw: any, username: string, accountId: string): GameRow | null {
  if (!raw?.pgn) return null;
  const { white, black } = raw;
  let me, opp, color: GameRow['userColor'];
  if (white.username.toLowerCase() === username) [me, opp, color] = [white, black, 'white'];
  else if (black.username.toLowerCase() === username) [me, opp, color] = [black, white, 'black'];
  else return null;
  const code: string = me.result ?? '';
  const result = code === 'win' ? 'win' : DRAW_CODES.has(code) ? 'draw' : 'loss';
  const ecoUrl: string = raw.eco ?? '';
  const platformGameId: string = raw.uuid ?? raw.url;
  return {
    id: `${accountId}:${platformGameId}`,
    accountId,
    platformGameId,
    url: raw.url,
    timeClass: raw.time_class,
    timeControl: raw.time_control,
    rated: !!raw.rated,
    rules: raw.rules,
    endTime: raw.end_time,
    userColor: color,
    userRating: me.rating,
    opponent: opp.username,
    opponentRating: opp.rating,
    result,
    resultDetail: code === 'win' ? opp.result : code,
    eco: /\[ECO "([^"]+)"\]/.exec(raw.pgn)?.[1],
    opening: ecoUrl ? ecoUrl.split('/').pop()!.replaceAll('-', ' ') : undefined,
    pgn: raw.pgn,
  };
}

/** "[%clk 0:02:59.9]" -> 179.9 */
export function parseClock(comment?: string): number | undefined {
  const m = comment && /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : undefined;
}

/** Fill eval/win/classification for each ply given evals of every position (plies.length + 1). */
export function scorePlies(
  plies: Omit<MoveRow, 'evalBefore' | 'evalAfter' | 'winBefore' | 'winAfter' | 'classification'>[],
  evals: number[],
): MoveRow[] {
  return plies.map((p, i) => {
    const sign = p.color === 'white' ? 1 : -1;
    const winBefore = winChance(sign * evals[i]);
    const winAfter = winChance(sign * evals[i + 1]);
    return {
      ...p,
      evalBefore: evals[i],
      evalAfter: evals[i + 1],
      winBefore: Math.round(winBefore * 10) / 10,
      winAfter: Math.round(winAfter * 10) / 10,
      classification: p.uci === p.bestUci ? undefined : classify(winBefore - winAfter),
    };
  });
}
