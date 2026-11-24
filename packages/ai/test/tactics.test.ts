import { describe, expect, it } from 'vitest';
import { readBoard } from '../src/board';
import { chooseAction } from '../src/chooseAction';
import { DEFAULT_PROFILE } from '../src/profile';
import { findTactics, forecastAttack } from '../src/tactics';
import { at, destination, makeGame, rules, unitAt, withCapture } from './fixtures';

describe('forecastAttack', () => {
  it('averages damage over the luck rolls and predicts the counterattack', () => {
    const state = makeGame(
      ['...'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const forecast = forecastAttack(rules, state, unitAt(state, 0, 0), 0, 1)!;
    // 50% base on plains (1 star): 45 to 49 damage depending on luck.
    expect(forecast.dealt).toBeGreaterThan(44);
    expect(forecast.dealt).toBeLessThan(50);
    expect(forecast.killChance).toBe(0);
    expect(forecast.counter).toBeGreaterThan(0);
  });

  it('reports a certain kill with no counterattack', () => {
    const state = makeGame(
      ['...'],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1, hp: 20 },
      ],
    );
    const forecast = forecastAttack(rules, state, unitAt(state, 0, 0), 0, 1)!;
    expect(forecast).toEqual({ dealt: 20, killChance: 1, counter: 0 });
  });

  it('is null when the attacker has no weapon for the target', () => {
    const state = makeGame(
      ['...'],
      [
        { x: 0, y: 0, type: 'apc', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    expect(forecastAttack(rules, state, unitAt(state, 0, 0), 0, 1)).toBeNull();
  });
});

describe('attacks', () => {
  it('finishes off a weakened unit before chipping a healthy one', () => {
    const state = makeGame(
      ['.....', '.....', '.....'],
      [
        { x: 1, y: 1, type: 'tank', owner: 0 },
        { x: 2, y: 1, type: 'infantry', owner: 1 },
        { x: 1, y: 2, type: 'infantry', owner: 1, hp: 30 },
      ],
    );
    const action = chooseAction(rules, state);
    expect(action).toMatchObject({ type: 'Attack', target: at(state, 1, 2) });
  });

  it('turns down attacks that lose more than they deal', () => {
    const state = makeGame(
      ['.....'],
      [
        { x: 1, y: 0, type: 'infantry', owner: 0 },
        { x: 2, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const tactics = findTactics(readBoard(rules, state, DEFAULT_PROFILE));
    expect(tactics.filter((tactic) => tactic.kind === 'Attack')).toEqual([]);
  });

  it('fires indirect units only from where they stand', () => {
    const state = makeGame(
      ['.......'],
      [
        { x: 0, y: 0, type: 'artillery', owner: 0 },
        { x: 5, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const tactics = findTactics(readBoard(rules, state, DEFAULT_PROFILE));
    expect(tactics.filter((tactic) => tactic.kind === 'Attack')).toEqual([]);
  });

  it('stops an enemy that would capture its HQ next turn, ahead of a richer target', () => {
    const state = withCapture(
      makeGame(
        ['H.....', '......'],
        [
          { x: 3, y: 0, type: 'tank', owner: 0 },
          { x: 0, y: 0, type: 'infantry', owner: 1 },
          { x: 4, y: 0, type: 'artillery', owner: 1 },
        ],
      ),
      0,
      10,
    );
    expect(chooseAction(rules, state)).toMatchObject({ type: 'Attack', target: 0 });
  });
});

describe('captures', () => {
  it('captures a property it can reach', () => {
    const state = makeGame(['..C..'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const action = chooseAction(rules, state);
    expect(action.type).toBe('Capture');
    expect(destination(state, action)).toBe(at(state, 2, 0));
  });

  it('finishes a capture in progress rather than starting another', () => {
    const state = withCapture(
      makeGame(['C.C..'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]),
      0,
      10,
    );
    expect(chooseAction(rules, state)).toEqual({ type: 'Capture', unit: 1, path: [] });
  });

  it('takes the enemy HQ over a good attack when the capture would finish', () => {
    const state = withCapture(
      makeGame(
        ['h..'],
        [
          { x: 0, y: 0, type: 'infantry', owner: 0 },
          { x: 1, y: 0, type: 'artillery', owner: 1, hp: 10 },
        ],
      ),
      0,
      10,
    );
    expect(chooseAction(rules, state)).toEqual({ type: 'Capture', unit: 1, path: [] });
  });
});
