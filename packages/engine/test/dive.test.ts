import { describe, expect, it } from 'vitest';
import {
  attackTargetsFrom,
  getUnitOptions,
  previewAttack,
  type Action,
  type GameState,
} from '../src/index';
import { apply, makeGame, reject, unitAt, withUnit, type PlacedUnit } from './fixtures';
import { navalRules } from './navalFixtures';

function game(rows: readonly string[], units: readonly PlacedUnit[]): GameState {
  return makeGame(rows, units, 1, navalRules);
}

function play(state: GameState, action: Action) {
  return apply(state, action, navalRules);
}

function fullRound(state: GameState): GameState {
  return play(play(state, { type: 'EndTurn' }).state, { type: 'EndTurn' }).state;
}

/** The same position with `unit` already dived. */
function dived(state: GameState, unit: number): GameState {
  return withUnit(state, unit, { dived: true });
}

describe('dive and surface', () => {
  // A sub on open sea, with a tank on the shoal beside it and a destroyer further out.
  const setup = () =>
    game(
      [':~~~~', '.....'],
      [
        { x: 1, y: 0, type: 'sub', owner: 0 },
        { x: 0, y: 0, type: 'tank', owner: 1 },
        { x: 3, y: 0, type: 'destroyer', owner: 1 },
      ],
    );

  it('dives after moving, and surfaces again on a later turn', () => {
    let state = setup();
    const sub = unitAt(state, 1, 0).id;
    expect(getUnitOptions(navalRules, state, sub, 2)).toMatchObject({
      canDive: true,
      canSurface: false,
    });

    const result = play(state, { type: 'Dive', unit: sub, path: [2] });
    expect(result.state.units[sub]).toMatchObject({ pos: 2, dived: true, moved: true });
    expect(result.events).toContainEqual({ type: 'Dived', unit: sub });

    state = fullRound(result.state);
    expect(getUnitOptions(navalRules, state, sub, 2)).toMatchObject({
      canDive: false,
      canSurface: true,
    });
    const surfaced = play(state, { type: 'Surface', unit: sub, path: [] });
    expect(surfaced.state.units[sub]).toMatchObject({ dived: false, moved: true });
    expect(surfaced.events).toContainEqual({ type: 'Surfaced', unit: sub });
  });

  it('refuses to dive twice, to surface on the surface, or to dive a unit that cannot', () => {
    const state = setup();
    const sub = unitAt(state, 1, 0).id;
    expect(reject(state, { type: 'Surface', unit: sub, path: [] }, navalRules)).toMatch(
      /not dived/,
    );
    expect(reject(dived(state, sub), { type: 'Dive', unit: sub, path: [] }, navalRules)).toMatch(
      /already dived/,
    );
    const theirs = play(state, { type: 'EndTurn' }).state;
    const destroyer = unitAt(theirs, 3, 0).id;
    expect(reject(theirs, { type: 'Dive', unit: destroyer, path: [] }, navalRules)).toMatch(
      /cannot dive/,
    );
  });

  it('can only be attacked by the units its dive rule names', () => {
    const base = play(setup(), { type: 'EndTurn' }).state;
    const sub = unitAt(base, 1, 0).id;
    const tank = unitAt(base, 0, 0).id;
    const destroyer = unitAt(base, 3, 0).id;
    const surfaced = base;
    const under = dived(base, sub);

    expect(attackTargetsFrom(navalRules, surfaced, surfaced.units[tank]!, 0, false)).toEqual([1]);
    expect(attackTargetsFrom(navalRules, under, under.units[tank]!, 0, false)).toEqual([]);
    expect(previewAttack(navalRules, under, tank, 0, 1)).toBeNull();
    expect(reject(under, { type: 'Attack', unit: tank, path: [], target: 1 }, navalRules)).toMatch(
      /no weapon/,
    );

    const hit = play(under, { type: 'Attack', unit: destroyer, path: [2], target: 1 });
    expect(hit.state.units[sub]!.hp).toBeLessThan(100);
  });

  it('attacks while dived, and only units that could hit it fire back', () => {
    const state = setup();
    const sub = unitAt(state, 1, 0).id;
    // The tank could shell a surfaced sub, so it answers that one.
    expect(previewAttack(navalRules, state, sub, 1, 0)!.counterMax).toBeGreaterThan(0);
    const under = dived(state, sub);
    expect(previewAttack(navalRules, under, sub, 1, 0)!.counterMax).toBe(0);

    const result = play(under, { type: 'Attack', unit: sub, path: [], target: 0 });
    expect(result.state.units[sub]).toMatchObject({ hp: 100, dived: true });
    expect(result.events.filter((event) => event.type === 'Attacked')).toHaveLength(1);
  });

  it('burns its dived fuel rate each day', () => {
    const state = setup();
    const sub = unitAt(state, 1, 0).id;
    expect(fullRound(state).units[sub]!.fuel).toBe(59);
    expect(fullRound(dived(state, sub)).units[sub]!.fuel).toBe(55);
  });

  it('keeps the dive state of the unit a sub joins into', () => {
    const base = game(
      ['~~~~~', '.....'],
      [
        { x: 1, y: 0, type: 'sub', owner: 0 },
        { x: 2, y: 0, type: 'sub', owner: 0, hp: 50 },
        { x: 4, y: 1, type: 'infantry', owner: 1 },
      ],
    );
    const mover = unitAt(base, 1, 0).id;
    const target = unitAt(base, 2, 0).id;
    const join = { type: 'Join', unit: mover, path: [2] } as const;

    const intoDived = play(dived(base, target), join).state;
    expect(intoDived.units[mover]).toBeUndefined();
    expect(intoDived.units[target]).toMatchObject({ hp: 100, dived: true });

    const fromDived = play(dived(base, mover), join).state;
    expect(fromDived.units[target]).toMatchObject({ hp: 100, dived: false });
  });
});
