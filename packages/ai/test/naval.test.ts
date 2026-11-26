import type { GameState, Unit } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/chooseAction';
import { destination, makeGame, rules, unitAt } from './fixtures';

function withUnit(state: GameState, unit: Unit, patch: Partial<Unit>): GameState {
  return { ...state, units: { ...state.units, [unit.id]: { ...unit, ...patch } } };
}

/** An airport on the left of open sea, with an enemy far off on the right. */
const LONG_SEA = ['A' + '~'.repeat(28) + '.'];

describe('fuel', () => {
  const sortie = (x: number, fuel: number) => {
    const state = makeGame(LONG_SEA, [
      { x, y: 0, type: 'bomber', owner: 0 },
      { x: 29, y: 0, type: 'infantry', owner: 1 },
    ]);
    return withUnit(state, unitAt(state, x, 0), { fuel });
  };

  it('turns an aircraft for home once its fuel would only just get it back', () => {
    // 14 tiles from the airport: two days of flying at 5 fuel a day, plus a reserve.
    const state = sortie(14, 30);
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action) % state.width).toBeLessThan(14);
  });

  it('presses on toward the enemy while it has fuel to spare', () => {
    const state = sortie(14, 99);
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action) % state.width).toBeGreaterThan(14);
  });

  it('never flies further out than it could come back from', () => {
    // From x, the way back needs x fuel, 5 a day on the way and a reserve of 5.
    const state = sortie(0, 20);
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    const x = destination(state, action) % state.width;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(5);
  });
});
