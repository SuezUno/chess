import { describe, expect, it } from 'vitest';
import { classify, parseChesscomGame, parseClock, scorePlies, winChance } from './core';

const raw = (white: string, black: string, rw: string, rb: string) => ({
  uuid: 'u1', url: 'https://www.chess.com/game/live/1', time_class: 'blitz', time_control: '180',
  rated: true, rules: 'chess', end_time: 1700000000,
  white: { username: white, rating: 500, result: rw }, black: { username: black, rating: 510, result: rb },
  eco: 'https://www.chess.com/openings/Italian-Game', pgn: '[ECO "C50"]\n\n1. e4 e5 *',
});

describe('core', () => {
  it('win chance and thresholds match the Python version', () => {
    expect(winChance(0)).toBeCloseTo(50);
    expect(winChance(300)).toBeGreaterThan(75);
    expect(classify(35)).toBe('blunder');
    expect(classify(25)).toBe('mistake');
    expect(classify(5)).toBeUndefined();
  });

  it('parses a chess.com game from either side', () => {
    const w = parseChesscomGame(raw('Player1', 'rival', 'win', 'resigned'), 'player1', 'chesscom:player1')!;
    expect([w.userColor, w.result, w.resultDetail, w.eco, w.opening]).toEqual(['white', 'win', 'resigned', 'C50', 'Italian Game']);
    const b = parseChesscomGame(raw('rival', 'player1', 'agreed', 'agreed'), 'player1', 'chesscom:player1')!;
    expect([b.userColor, b.result]).toEqual(['black', 'draw']);
    expect(parseChesscomGame(raw('a', 'b', 'win', 'lose'), 'player1', 'x')).toBeNull();
  });

  it('reads clocks and scores a blunder', () => {
    expect(parseClock('[%clk 0:02:59.9]')).toBeCloseTo(179.9);
    const base = { gameId: 'g', fenBefore: '', san: 'x' };
    const moves = scorePlies(
      [{ ...base, ply: 1, color: 'white', uci: 'a2a3', bestUci: 'e2e4' }, { ...base, ply: 2, color: 'black', uci: 'e7e5', bestUci: 'e7e5' }],
      [30, -900, -900],
    );
    expect(moves[0].classification).toBe('blunder');
    expect(moves[1].classification).toBeUndefined();
  });
});
