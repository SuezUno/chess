// Player profile from analyzed games. Every finding compares the user with a reference measured the same way,
// usually the opponents in the same games (chess.com pairs players of similar rating), with a z-test for confidence.
// Pure logic (no browser APIs), unit-tested in profile.test.ts.
import { Chess, type Square } from 'chess.js';
import { MATE, type GameRow, type MoveRow } from './core';

export type Confidence = 'baja' | 'media' | 'alta';
export interface Evidence { game: GameRow; move?: MoveRow }
export interface Finding {
  kind: 'weakness' | 'strength';
  title: string;
  detail: string;
  confidence: Confidence;
  evidence: Evidence[];
  /** Rates behind the finding, for the UI bars. */
  compare: { you: number; them: number; labels: [string, string] };
  z: number;
}
export type ErrorCause = 'mate' | 'hanging' | 'threat' | 'missedPunish' | 'other';

const isError = (m?: MoveRow) => m?.classification === 'blunder' || m?.classification === 'mistake';
export const fmtPct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0).replace('.', ',')} %`;

/** Two-proportion z statistic: positive when the first rate is higher. */
export function zScore(x1: number, n1: number, x2: number, n2: number): number {
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? (x1 / n1 - x2 / n2) / se : 0;
}
// One-sided 95 / 97.5 / 99.5 %. shortcut: moves of one game are not independent, so z runs a bit high;
// a per-game bootstrap would fix it if findings look too eager.
const confOf = (z: number): Confidence | undefined => (z >= 2.58 ? 'alta' : z >= 1.96 ? 'media' : z >= 1.64 ? 'baja' : undefined);

/** Why an error lost: uses the engine's best reply (stored on the next ply). Works for either side. */
export function errorCause(m: MoveRow, prev?: MoveRow, next?: MoveRow): ErrorCause {
  if (isError(prev)) return 'missedPunish';
  const sign = m.color === 'white' ? 1 : -1;
  if (sign * m.evalAfter === -MATE) return 'mate';
  const reply = next?.bestUci;
  if (!reply) return 'other';
  const target = reply.slice(2, 4) as Square;
  const victim = new Chess(next.fenBefore).get(target);
  if (!victim || victim.color !== m.color[0]) return 'other';
  if (target === m.uci.slice(2, 4)) return 'hanging';
  const before = new Chess(m.fenBefore);
  const sameBefore = before.get(target);
  // The piece was already there and already attacked: the threat was ignored.
  return sameBefore?.type === victim.type && before.isAttacked(target, m.color === 'white' ? 'b' : 'w') ? 'threat' : 'hanging';
}

export function phaseOf(m: MoveRow): 'opening' | 'middlegame' | 'endgame' {
  if (m.ply <= 20) return 'opening';
  const pieces = m.fenBefore.split(' ')[0].replace(/[kKpP\d/]/g, '').length;
  return pieces <= 6 ? 'endgame' : 'middlegame';
}

/** "Sicilian Defense Alapin Variation" -> "Sicilian Defense" */
export function openingFamily(name?: string): string | undefined {
  if (!name) return undefined;
  const m = /^(.*?\b(?:Defense|Game|Opening|Attack|Gambit|System))\b/.exec(name);
  return m ? m[1] : name.split(' ').slice(0, 2).join(' ');
}

const CAUSES = {
  hanging: { what: 'Jugadas que dejan una pieza sin defensa', weakness: 'Dejas piezas sin defensa', strength: 'Cuidas bien tus piezas' },
  threat: { what: 'Jugadas que ignoran una amenaza', weakness: 'No ves las amenazas del rival', strength: 'Ves venir las amenazas' },
  mate: { what: 'Jugadas que permiten mate', weakness: 'No ves el mate del rival', strength: 'Detectas los mates del rival' },
};
const PHASES = { opening: 'la apertura', middlegame: 'el medio juego', endgame: 'los finales' };
const RIVALS: [string, string] = ['Tú', 'Tus rivales'];

export function buildProfile(games: GameRow[], moves: MoveRow[]): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(games.map((g) => [g.id, g]));
  const byPly = new Map(moves.map((m) => [`${m.gameId}:${m.ply}`, m]));
  const at = (m: MoveRow, d: number) => byPly.get(`${m.gameId}:${m.ply + d}`);
  const recentFirst = (a: Evidence, b: Evidence) => b.game.endTime - a.game.endTime;
  const known = moves.filter((m) => byId.has(m.gameId));
  const isMine = (m: MoveRow) => byId.get(m.gameId)!.userColor === m.color;
  const mine = known.filter(isMine);
  const theirs = known.filter((m) => !isMine(m));
  const ev = (list: MoveRow[]) => list.map((m) => ({ game: byId.get(m.gameId)!, move: m })).sort(recentFirst).slice(0, 5);
  const analyzedIds = [...new Set(known.map((m) => m.gameId))];
  /** Recent games where none of the user's moves match `bad`. */
  const cleanGames = (bad: (m: MoveRow) => boolean) => {
    const dirty = new Set(mine.filter(bad).map((m) => m.gameId));
    return analyzedIds.filter((id) => !dirty.has(id)).map((id) => ({ game: byId.get(id)! })).sort(recentFirst).slice(0, 5);
  };

  /** Adds a finding when the user's rate differs from the reference rate with enough evidence. */
  function compare(o: {
    you: [number, number]; them: [number, number]; higherIsBetter?: boolean; labels?: [string, string];
    what: string; strength: string; weakness: string; good: () => Evidence[]; bad: () => Evidence[];
  }) {
    const [[x1, n1], [x2, n2]] = [o.you, o.them];
    if (n1 < 10 || n2 < 10) return;
    const z = zScore(x1, n1, x2, n2);
    const confidence = confOf(Math.abs(z));
    if (!confidence) return;
    const youBetter = (z > 0) === !!o.higherIsBetter;
    const labels = o.labels ?? RIVALS;
    findings.push({
      kind: youBetter ? 'strength' : 'weakness', title: youBetter ? o.strength : o.weakness, confidence, z: Math.abs(z),
      detail: `${o.what}: ${fmtPct(x1 / n1)} frente a ${fmtPct(x2 / n2)} (${n1} y ${n2} casos)`,
      compare: { you: x1 / n1, them: x2 / n2, labels },
      evidence: youBetter ? o.good() : o.bad(),
    });
  }

  // 1. Causes of errors, per move.
  const causeOf = new Map(known.filter(isError).map((m) => [m, errorCause(m, at(m, -1), at(m, 1))]));
  for (const [cause, t] of Object.entries(CAUSES)) {
    const hit = (m: MoveRow) => causeOf.get(m) === cause;
    compare({
      ...t, you: [mine.filter(hit).length, mine.length], them: [theirs.filter(hit).length, theirs.length],
      good: () => cleanGames(hit), bad: () => ev(mine.filter(hit)),
    });
  }

  // 2. Punishing errors: how often the answer to the other side's error is itself an error.
  const answers = (side: MoveRow[]) => side.filter(isError).map((m) => at(m, 1)).filter((m): m is MoveRow => !!m);
  const [myAns, theirAns] = [answers(theirs), answers(mine)];
  compare({
    what: 'Errores del rival que no castigas', strength: 'Castigas los errores del rival', weakness: 'No aprovechas los errores del rival',
    you: [myAns.filter(isError).length, myAns.length], them: [theirAns.filter(isError).length, theirAns.length],
    good: () => ev(myAns.filter((m) => !m.classification)), bad: () => ev(myAns.filter(isError)),
  });

  // 3. Error rate by phase.
  for (const [phase, label] of Object.entries(PHASES)) {
    const bad = (m: MoveRow) => phaseOf(m) === phase && isError(m);
    const rate = (side: MoveRow[]): [number, number] => [side.filter(bad).length, side.filter((m) => phaseOf(m) === phase).length];
    compare({
      what: `Jugadas con error en ${label}`, strength: `Juegas ${label} mejor que tus rivales`, weakness: `Fallas más que tus rivales en ${label}`,
      you: rate(mine), them: rate(theirs), good: () => cleanGames(bad), bad: () => ev(mine.filter(bad)),
    });
  }

  // 4. Converting won positions (peak >= 85 %), against the opponents converting theirs.
  const score1 = (g: GameRow) => (g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0);
  const movesByGame = new Map<string, MoveRow[]>();
  for (const m of known) {
    if (!movesByGame.has(m.gameId)) movesByGame.set(m.gameId, []);
    movesByGame.get(m.gameId)!.push(m);
  }
  const extremes = [...movesByGame].map(([id, gm]) => {
    const userWin = (m: MoveRow) => (isMine(m) ? m.winBefore : 100 - m.winBefore);
    const peak = gm.reduce((x, m) => (userWin(m) > userWin(x) ? m : x));
    return { game: byId.get(id)!, peak, peakWin: userWin(peak), troughWin: Math.min(...gm.map(userWin)) };
  });
  const won = extremes.filter((e) => e.peakWin >= 85);
  const lost = extremes.filter((e) => e.troughWin <= 15);
  const wonEv = (keep: (g: GameRow) => boolean) =>
    won.filter((e) => keep(e.game)).map((e) => ({ game: e.game, move: e.peak })).sort(recentFirst).slice(0, 5);
  compare({
    what: 'Puntos sacados yendo ganando', strength: 'Conviertes las ventajas', weakness: 'Se te escapan partidas ganadas', higherIsBetter: true,
    you: [won.reduce((s, e) => s + score1(e.game), 0), won.length], them: [lost.reduce((s, e) => s + 1 - score1(e.game), 0), lost.length],
    good: () => wonEv((g) => g.result === 'win'), bad: () => wonEv((g) => g.result !== 'win'),
  });

  // 5. Time trouble: clock under 10 % of the base time.
  const base = (g: GameRow) => (g.timeControl && !g.timeControl.includes('/') ? +g.timeControl.split('+')[0] : 0);
  const timed = (side: MoveRow[]) => side.filter((m) => m.clockSeconds !== undefined && base(byId.get(m.gameId)!) > 0);
  const isLow = (m: MoveRow) => m.clockSeconds !== undefined && m.clockSeconds < base(byId.get(m.gameId)!) * 0.1;
  const [myTimed, theirTimed] = [timed(mine), timed(theirs)];
  const [myLow, theirLow] = [myTimed.filter(isLow), theirTimed.filter(isLow)];
  compare({
    what: 'Jugadas con menos del 10 % del reloj', strength: 'Administras bien el reloj', weakness: 'Te quedas sin tiempo más que tus rivales',
    you: [myLow.length, myTimed.length], them: [theirLow.length, theirTimed.length],
    good: () => cleanGames(isLow), bad: () => ev(myLow.filter(isError)),
  });
  compare({
    what: 'Errores con poco reloj', strength: 'Aguantas bien los apuros de tiempo', weakness: 'Te precipitas con poco tiempo',
    you: [myLow.filter(isError).length, myLow.length], them: [theirLow.filter(isError).length, theirLow.length],
    good: () => [], bad: () => ev(myLow.filter(isError)),
  });

  // 6. Openings: results over the last 500 games (no analysis needed), against the rest of the user's games with that colour.
  const recent = [...games].sort((a, b) => b.endTime - a.endTime).slice(0, 500);
  const groups = new Map<string, GameRow[]>();
  for (const g of recent) {
    const fam = openingFamily(g.opening);
    if (fam) groups.set(`${g.userColor}|${fam}`, [...(groups.get(`${g.userColor}|${fam}`) ?? []), g]);
  }
  const points = (gs: GameRow[]) => gs.reduce((s, g) => s + score1(g), 0);
  for (const [key, gs] of groups) {
    const [color, fam] = key.split('|');
    const inGroup = new Set(gs);
    const rest = recent.filter((g) => g.userColor === color && !inGroup.has(g));
    const pick = (r: GameRow['result']) => gs.filter((g) => g.result === r).slice(0, 5).map((game) => ({ game }));
    compare({
      what: `Puntos con ${color === 'white' ? 'blancas' : 'negras'}`, labels: [fam, 'Resto'], higherIsBetter: true,
      strength: `Buenos resultados con ${fam}`, weakness: `Resultados flojos con ${fam}`,
      you: [points(gs), gs.length], them: [points(rest), rest.length], good: () => pick('win'), bad: () => pick('loss'),
    });
  }

  return findings.sort((a, b) => b.z - a.z);
}
