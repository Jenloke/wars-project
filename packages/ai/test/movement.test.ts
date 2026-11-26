import { describe, expect, it } from 'vitest';
import { readBoard } from '../src/board';
import { chooseAction } from '../src/chooseAction';
import { makePlan } from '../src/plan';
import { DEFAULT_PROFILE } from '../src/profile';
import { at, destination, makeGame, rules, unitAt, withCapture } from './fixtures';

describe('movement', () => {
  it('sends a badly damaged unit back to an owned property to repair', () => {
    const state = makeGame(
      ['c...........'],
      [
        { x: 4, y: 0, type: 'tank', owner: 0, hp: 20 },
        { x: 11, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action)).toBe(at(state, 0, 0));
  });

  it('keeps artillery out of reach of enemy tanks while closing in', () => {
    const state = makeGame(
      ['.............'],
      [
        { x: 0, y: 0, type: 'artillery', owner: 0 },
        { x: 12, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    // The tank can fire on x >= 5 next turn (six moves plus one).
    const x = destination(state, action) % state.width;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(5);
  });

  it('stands on its HQ when an enemy capturer could reach it', () => {
    const state = makeGame(
      ['H.....', '......', '......', '......'],
      [
        { x: 3, y: 0, type: 'infantry', owner: 0 },
        { x: 0, y: 3, type: 'infantry', owner: 1 },
      ],
    );
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action)).toBe(at(state, 0, 0));
  });

  it('repairs on a base even when the base could build instead', () => {
    const state = makeGame(
      ['R...........'],
      [
        { x: 2, y: 0, type: 'tank', owner: 0, hp: 20 },
        { x: 11, y: 0, type: 'infantry', owner: 1 },
      ],
      [7000, 0],
    );
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action)).toBe(at(state, 0, 0));
  });

  it('steps off a base it is blocking so the base can build', () => {
    const state = makeGame(['R....'], [{ x: 0, y: 0, type: 'tank', owner: 0 }], [7000, 0]);
    const move = chooseAction(rules, state);
    expect(move.type).toBe('Move');
    expect(destination(state, move)).not.toBe(at(state, 0, 0));
  });

  it('heads for its assigned property when it cannot reach one this turn', () => {
    const state = makeGame(['........C'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Move');
    expect(destination(state, action)).toBe(at(state, 3, 0));
  });
});

describe('capture plan', () => {
  it('gives the nearer property to the nearer unit and sends the other on', () => {
    const state = makeGame(
      ['C.........C'],
      [
        { x: 1, y: 0, type: 'infantry', owner: 0 },
        { x: 2, y: 0, type: 'infantry', owner: 0 },
      ],
    );
    const plan = makePlan(readBoard(rules, state, DEFAULT_PROFILE));
    expect(plan.captureTargets.get(unitAt(state, 1, 0).id)).toBe(at(state, 0, 0));
    expect(plan.captureTargets.get(unitAt(state, 2, 0).id)).toBe(at(state, 10, 0));
    expect(plan.unclaimed).toBe(0);
  });

  it('leaves badly damaged capturers out, unless they are mid-capture', () => {
    const state = makeGame(
      ['C....C'],
      [
        { x: 1, y: 0, type: 'infantry', owner: 0, hp: 20 },
        { x: 5, y: 0, type: 'infantry', owner: 0, hp: 20 },
      ],
    );
    const capturing = withCapture(state, at(state, 5, 0), 18);
    const plan = makePlan(readBoard(rules, capturing, DEFAULT_PROFILE));
    expect(plan.captureTargets.has(unitAt(state, 1, 0).id)).toBe(false);
    expect(plan.captureTargets.get(unitAt(state, 5, 0).id)).toBe(at(state, 5, 0));
    expect(plan.unclaimed).toBe(1);
  });

  it('skips properties an enemy is standing on', () => {
    const state = makeGame(
      ['C..C'],
      [
        { x: 1, y: 0, type: 'infantry', owner: 0 },
        { x: 0, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const plan = makePlan(readBoard(rules, state, DEFAULT_PROFILE));
    expect(plan.captureTargets.get(unitAt(state, 1, 0).id)).toBe(at(state, 3, 0));
  });
});
