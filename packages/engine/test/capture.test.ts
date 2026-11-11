import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/index';
import { apply, makeGame, reject, unitAt, withUnit } from './fixtures';

/** Ends the current turn and the opponent's, returning to the same player. */
function fullRound(state: GameState): GameState {
  return apply(apply(state, { type: 'EndTurn' }).state, { type: 'EndTurn' }).state;
}

describe('capture', () => {
  const setup = () => makeGame(['.C.'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);

  it('takes two turns for a full-strength unit', () => {
    let state = setup();
    const id = unitAt(state, 0, 0).id;
    state = apply(state, { type: 'Capture', unit: id, path: [1] }).state;
    expect(state.capture[1]).toBe(10);
    expect(state.owner[1]).toBe(-1);

    state = fullRound(state);
    const result = apply(state, { type: 'Capture', unit: id, path: [] });
    expect(result.state.owner[1]).toBe(0);
    expect(result.state.capture[1]).toBe(20);
    expect(result.events).toContainEqual({ type: 'Captured', at: 1, by: 0 });
  });

  it('progresses by displayed HP', () => {
    const base = setup();
    const id = unitAt(base, 0, 0).id;
    const state = apply(withUnit(base, id, { hp: 45 }), {
      type: 'Capture',
      unit: id,
      path: [1],
    }).state;
    expect(state.capture[1]).toBe(15);
  });

  it('resets when the capturing unit leaves', () => {
    let state = setup();
    const id = unitAt(state, 0, 0).id;
    state = fullRound(apply(state, { type: 'Capture', unit: id, path: [1] }).state);
    state = apply(state, { type: 'Move', unit: id, path: [2] }).state;
    expect(state.capture[1]).toBe(20);
  });

  it('resets when the capturing unit is destroyed', () => {
    let state = makeGame(
      ['=C=', '==='],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0, hp: 10 },
        { x: 0, y: 1, type: 'infantry', owner: 0 },
        { x: 2, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const id = unitAt(state, 0, 0).id;
    state = apply(state, { type: 'Capture', unit: id, path: [1] }).state;
    expect(state.capture[1]).toBe(19);
    state = apply(state, { type: 'EndTurn' }).state;
    state = apply(state, {
      type: 'Attack',
      unit: unitAt(state, 2, 0).id,
      path: [],
      target: 1,
    }).state;
    expect(state.units[id]).toBeUndefined();
    expect(state.capture[1]).toBe(20);
  });

  it('is refused for units that cannot capture and for owned properties', () => {
    const state = makeGame(
      ['.Cc'],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 2, y: 0, type: 'infantry', owner: 0 },
      ],
    );
    expect(reject(state, { type: 'Capture', unit: unitAt(state, 0, 0).id, path: [1] })).toMatch(
      /Nothing to capture/,
    );
    expect(reject(state, { type: 'Capture', unit: unitAt(state, 2, 0).id, path: [] })).toMatch(
      /Nothing to capture/,
    );
  });

  it('wins the game when an HQ is captured', () => {
    let state = makeGame(
      ['.h.b', 'H...'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 3, y: 1, type: 'tank', owner: 1 },
      ],
    );
    const id = unitAt(state, 0, 0).id;
    state = fullRound(apply(state, { type: 'Capture', unit: id, path: [1] }).state);
    const result = apply(state, { type: 'Capture', unit: id, path: [] });
    state = result.state;

    expect(state.status).toEqual({ kind: 'won', winner: 0, reason: 'hq' });
    expect(state.players[1]!.alive).toBe(false);
    expect(state.owner[3]).toBe(0); // the loser's base passes to the captor
    expect(Object.values(state.units).some((unit) => unit.owner === 1)).toBe(false);
    expect(result.events).toContainEqual({ type: 'GameWon', winner: 0, reason: 'hq' });
    expect(reject(state, { type: 'EndTurn' })).toMatch(/over/);
  });
});
