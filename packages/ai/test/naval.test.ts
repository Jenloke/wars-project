import type { GameState, Unit } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/chooseAction';
import { apply, destination, makeGame, rules, unitAt } from './fixtures';

function withUnit(state: GameState, unit: Unit, patch: Partial<Unit>): GameState {
  return { ...state, units: { ...state.units, [unit.id]: { ...unit, ...patch } } };
}

/** An airport on the left of open sea, with an enemy far off on the right. */
const LONG_SEA = ['A' + '~'.repeat(28) + '.'];

describe('diving', () => {
  it('dives a submarine that an enemy could otherwise hit', () => {
    const state = makeGame(
      ['~~~~~~~~~~'],
      [
        { x: 0, y: 0, type: 'submarine', owner: 0 },
        { x: 6, y: 0, type: 'bomber', owner: 1 },
      ],
    );
    const sub = unitAt(state, 0, 0);
    const action = chooseAction(rules, state);
    expect(action).toMatchObject({ type: 'Dive', unit: sub.id });
  });

  it('surfaces when nothing that could hit it is near, to save fuel', () => {
    const base = makeGame(
      ['~~~~~~~...'],
      [
        { x: 0, y: 0, type: 'submarine', owner: 0 },
        { x: 9, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const state = withUnit(base, unitAt(base, 0, 0), { dived: true });
    expect(chooseAction(rules, state)).toMatchObject({ type: 'Surface' });
  });

  it('surfaces to head home when staying under would strand it', () => {
    const base = makeGame(
      ['P~~~~~~~~~'],
      [
        { x: 6, y: 0, type: 'submarine', owner: 0 },
        { x: 9, y: 0, type: 'bomber', owner: 1 },
      ],
    );
    const sub = unitAt(base, 6, 0);
    const state = withUnit(base, sub, { dived: true, fuel: 20 });
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Surface');
    expect(destination(state, action) % state.width).toBeLessThan(6);
  });
});

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

  it('moves a unit off the airport a damaged aircraft needs to land on', () => {
    const base = makeGame(
      ['~A~~~~~~~~~~~~~~~~~.'],
      [
        { x: 1, y: 0, type: 'battleCopter', owner: 0 },
        { x: 3, y: 0, type: 'battleCopter', owner: 0, hp: 20 },
        { x: 19, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const parked = unitAt(base, 1, 0);
    const action = chooseAction(rules, base);
    expect(action).toMatchObject({ type: 'Move', unit: parked.id });
    const next = chooseAction(rules, apply(base, action));
    expect(destination(apply(base, action), next)).toBe(1);
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
