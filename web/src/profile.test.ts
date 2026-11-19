import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { MATE, type GameRow, type MoveRow } from './core';
import { buildProfile, errorCause, openingFamily, phaseOf, zScore } from './profile';

/** Play `sans`; returns the MoveRow of the last move and the FEN after it. */
function row(sans: string[], extra: Partial<MoveRow> = {}): [MoveRow, string] {
  const c = new Chess();
  sans.slice(0, -1).forEach((s) => c.move(s));
  const fenBefore = c.fen();
  const mv = c.move(sans.at(-1)!);
  const m: MoveRow = {
    gameId: 'g', ply: sans.length, color: mv.color === 'w' ? 'white' : 'black', san: mv.san, uci: mv.lan, fenBefore,
    evalBefore: 0, evalAfter: 0, winBefore: 50, winAfter: 20, classification: 'blunder', ...extra,
  };
  return [m, c.fen()];
}
const reply = (fenBefore: string, bestUci: string) => ({ fenBefore, bestUci }) as MoveRow;

describe('profile', () => {
  it('tells a piece moved into danger from an ignored threat', () => {
    const [qg4, after1] = row(['e4', 'd5', 'Qg4']);
    expect(errorCause(qg4, undefined, reply(after1, 'c8g4'))).toBe('hanging');
    const [h3, after2] = row(['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'b5', 'h3']);
    expect(errorCause(h3, undefined, reply(after2, 'b5c4'))).toBe('threat');
  });

  it('flags missed mates and missed punishments', () => {
    const [m] = row(['e4', 'e5', 'Ke2'], { evalAfter: -MATE });
    expect(errorCause(m)).toBe('mate');
    expect(errorCause(m, { classification: 'blunder' } as MoveRow)).toBe('missedPunish');
    expect(errorCause({ ...m, evalAfter: -50 })).toBe('other');
  });

  it('phases and opening families', () => {
    expect(phaseOf({ ply: 5, fenBefore: '' } as MoveRow)).toBe('opening');
    expect(phaseOf({ ply: 60, fenBefore: '8/5k2/8/3r4/8/2N5/5K2/8 w - - 0 60' } as MoveRow)).toBe('endgame');
    expect(openingFamily('Sicilian Defense Alapin Variation')).toBe('Sicilian Defense');
    expect(openingFamily('Vienna')).toBe('Vienna');
  });

  it('compares converting won positions with how the opponents convert theirs', () => {
    // 12 games where the user (white) peaked at 90 % and 12 where the opponent did (user at 10 %).
    const make = (userWins: number, oppWins: number) => {
      const g = (id: string, result: GameRow['result']) => ({ id, endTime: 0, userColor: 'white', result }) as GameRow;
      const games = [
        ...Array.from({ length: 12 }, (_, i) => g(`u${i}`, i < userWins ? 'win' : 'loss')),
        ...Array.from({ length: 12 }, (_, i) => g(`o${i}`, i < oppWins ? 'loss' : 'win')),
      ];
      const moves = games.map((x) => ({ gameId: x.id, ply: 1, color: 'white', winBefore: x.id[0] === 'u' ? 90 : 10 }) as MoveRow);
      return buildProfile(games, moves).map((f) => f.title);
    };
    expect(make(12, 6)).toContain('Conviertes las ventajas');
    expect(make(4, 12)).toContain('Se te escapan partidas ganadas');
    expect(make(10, 10).filter((t) => /ventajas|ganadas/.test(t))).toEqual([]);
  });

  it('z statistic for two rates', () => {
    expect(zScore(50, 100, 30, 100)).toBeCloseTo(2.89, 1);
    expect(zScore(0, 100, 0, 100)).toBe(0);
  });

  it('finds an opening that scores below average, with games as evidence', () => {
    const g = (i: number, opening: string, result: GameRow['result']) =>
      ({ id: `g${i}`, endTime: i, userColor: 'white', opening, result }) as GameRow;
    const games = [
      ...Array.from({ length: 10 }, (_, i) => g(i, 'Italian Game Two Knights', 'loss')),
      ...Array.from({ length: 20 }, (_, i) => g(100 + i, 'Scotch Game', 'win')),
    ];
    const titles = buildProfile(games, []).map((f) => [f.kind, f.title, f.evidence.length]);
    expect(titles).toContainEqual(['weakness', 'Resultados flojos con Italian Game', 5]);
    expect(titles).toContainEqual(['strength', 'Buenos resultados con Scotch Game', 5]);
  });
});
