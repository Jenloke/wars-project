import { describe, expect, it } from 'vitest';
import { dangerAt, readBoard } from '../src/board';
import { DEFAULT_PROFILE } from '../src/profile';
import { at, makeGame, rules, unitAt } from './fixtures';

const PLAINS = ['.........', '.........', '.........'];

function boardFor(state: Parameters<typeof readBoard>[1]) {
  return readBoard(rules, state, DEFAULT_PROFILE);
}

describe('threat map', () => {
  it('covers every tile a direct unit could move next to, and no further', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'tank', owner: 1 },
    ]);
    const board = boardFor(state);
    const tank = unitAt(state, 8, 1).id;
    // Six moves reach (2,1); it can then fire on (1,1) but not (0,1).
    expect(board.attackers[at(state, 1, 1)]).toEqual([tank]);
    expect(board.attackers[at(state, 0, 1)]).toBeUndefined();
  });

  it('covers only the range band of an indirect unit, which cannot move and fire', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'artillery', owner: 1 },
    ]);
    const board = boardFor(state);
    expect(board.attackers[at(state, 6, 1)]).toHaveLength(1);
    expect(board.attackers[at(state, 5, 1)]).toHaveLength(1);
    expect(board.attackers[at(state, 7, 1)]).toBeUndefined();
    expect(board.attackers[at(state, 4, 1)]).toBeUndefined();
  });

  it('records where enemy capturers can reach', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'tank', owner: 0 },
      { x: 8, y: 1, type: 'infantry', owner: 1 },
    ]);
    const board = boardFor(state);
    expect(board.captureReach[at(state, 5, 1)]).toBe(1);
    expect(board.captureReach[at(state, 4, 1)]).toBe(0);
  });

  it('ignores the units of defeated players', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'tank', owner: 1 },
    ]);
    const players = state.players.map((player, i) =>
      i === 1 ? { ...player, alive: false } : player,
    );
    expect(boardFor({ ...state, players }).enemies).toHaveLength(0);
  });
});

describe('dangerAt', () => {
  it('is the expected loss in range of an enemy, and nothing out of range', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'tank', owner: 1 },
    ]);
    const board = boardFor(state);
    const infantry = unitAt(state, 0, 0);
    const inRange = dangerAt(board, infantry, at(state, 6, 1), infantry.hp);
    expect(inRange).toBeGreaterThan(0);
    expect(inRange).toBeLessThanOrEqual(1000); // never more than the unit is worth
    expect(dangerAt(board, infantry, at(state, 0, 1), infantry.hp)).toBe(0);
  });

  it('discounts attackers that would lose more to our counterattack than they deal', () => {
    const state = makeGame(PLAINS, [
      { x: 0, y: 0, type: 'tank', owner: 0 },
      { x: 1, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'infantry', owner: 1 },
    ]);
    const board = boardFor(state);
    const tile = at(state, 6, 1);
    // Infantry only scratches a tank (mostly through luck) and eats a heavy counter.
    const tankShare = dangerAt(board, unitAt(state, 0, 0), tile, 100) / 6500;
    const infantryShare = dangerAt(board, unitAt(state, 1, 0), tile, 100) / 1000;
    expect(infantryShare).toBeGreaterThan(0.2);
    expect(tankShare).toBeLessThan(infantryShare / 10);
  });

  it('is lower on terrain with more defence', () => {
    const state = makeGame(
      ['.F.......', '.........'],
      [
        { x: 0, y: 1, type: 'infantry', owner: 0 },
        { x: 4, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const board = boardFor(state);
    const infantry = unitAt(state, 0, 1);
    const forest = dangerAt(board, infantry, at(state, 1, 0), infantry.hp);
    const plains = dangerAt(board, infantry, at(state, 2, 0), infantry.hp);
    expect(forest).toBeGreaterThan(0);
    expect(forest).toBeLessThan(plains);
  });
});
