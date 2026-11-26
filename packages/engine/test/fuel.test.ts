import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '../src/index';
import { apply, at, makeGame, unitAt, withUnit, type PlacedUnit } from './fixtures';
import { navalRules } from './navalFixtures';

function game(rows: readonly string[], units: readonly PlacedUnit[]): GameState {
  return makeGame(rows, units, 1, navalRules);
}

function play(state: GameState, action: Action) {
  return apply(state, action, navalRules);
}

/** Ends both players' turns, returning to player 0 after their upkeep. */
function fullRound(state: GameState) {
  return play(play(state, { type: 'EndTurn' }).state, { type: 'EndTurn' });
}

describe('daily fuel use', () => {
  it('burns fuel at the start of its owner’s turn only', () => {
    let state = game(
      ['.....'],
      [
        { x: 1, y: 0, type: 'fighter', owner: 0 },
        { x: 2, y: 0, type: 'tank', owner: 0 },
        { x: 4, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const fighter = unitAt(state, 1, 0).id;
    const tank = unitAt(state, 2, 0).id;
    state = play(state, { type: 'EndTurn' }).state;
    expect(state.units[fighter]!.fuel).toBe(40);
    state = play(state, { type: 'EndTurn' }).state;
    expect(state.units[fighter]!.fuel).toBe(35);
    // Ground units only spend fuel by moving.
    expect(state.units[tank]!.fuel).toBe(70);
  });

  it('uses no fuel for units carried in a transport', () => {
    let state = game(
      ['.~~', '...'],
      [
        { x: 0, y: 0, type: 'copter', owner: 0 },
        { x: 1, y: 0, type: 'carrier', owner: 0 },
        { x: 0, y: 1, type: 'infantry', owner: 1 },
      ],
    );
    const copter = unitAt(state, 0, 0).id;
    const carrier = unitAt(state, 1, 0).id;
    state = play(state, { type: 'Load', unit: copter, path: [1] }).state;
    state = fullRound(state).state;
    expect(state.units[copter]).toMatchObject({ fuel: 29, carrier });
    expect(state.units[carrier]!.fuel).toBe(49);
  });
});

describe('running out of fuel', () => {
  it('crashes an aircraft whose tank empties', () => {
    const base = game(
      ['......', '......'],
      [
        { x: 0, y: 0, type: 'fighter', owner: 0 },
        { x: 3, y: 1, type: 'tank', owner: 0 },
        { x: 5, y: 1, type: 'infantry', owner: 1 },
      ],
    );
    const fighter = unitAt(base, 0, 0).id;
    const result = fullRound(withUnit(base, fighter, { fuel: 4 }));
    expect(result.state.units[fighter]).toBeUndefined();
    expect(result.state.occupant[0]).toBe(-1);
    expect(result.events).toContainEqual({
      type: 'UnitDestroyed',
      unit: fighter,
      at: 0,
      cause: 'fuel',
    });
    expect(result.state.status.kind).toBe('playing');
  });

  it('routs a player whose last unit crashes', () => {
    const base = game(
      ['....'],
      [
        { x: 0, y: 0, type: 'copter', owner: 0 },
        { x: 3, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const result = fullRound(withUnit(base, unitAt(base, 0, 0).id, { fuel: 1 }));
    expect(result.state.status).toEqual({ kind: 'won', winner: 1, reason: 'rout' });
  });

  it('refuels on an owned airport or beside a supply unit before the tank is checked', () => {
    let state = game(
      ['A.....', '......'],
      [
        { x: 0, y: 0, type: 'fighter', owner: 0 },
        { x: 2, y: 0, type: 'copter', owner: 0 },
        { x: 2, y: 1, type: 'apc', owner: 0 },
        { x: 5, y: 1, type: 'infantry', owner: 1 },
      ],
    );
    const fighter = unitAt(state, 0, 0).id;
    const copter = unitAt(state, 2, 0).id;
    state = withUnit(withUnit(state, fighter, { fuel: 3 }), copter, { fuel: 1 });
    state = fullRound(state).state;
    expect(state.units[fighter]!.fuel).toBe(40);
    expect(state.units[copter]!.fuel).toBe(30);
  });

  it('sinks a ship along with its cargo', () => {
    let state = game(
      ['.~~', '...'],
      [
        { x: 0, y: 0, type: 'copter', owner: 0 },
        { x: 1, y: 0, type: 'carrier', owner: 0 },
        { x: 2, y: 1, type: 'tank', owner: 0 },
        { x: 0, y: 1, type: 'infantry', owner: 1 },
      ],
    );
    const copter = unitAt(state, 0, 0).id;
    const carrier = unitAt(state, 1, 0).id;
    state = play(state, { type: 'Load', unit: copter, path: [1] }).state;
    state = fullRound(withUnit(state, carrier, { fuel: 1 })).state;
    expect(state.units[carrier]).toBeUndefined();
    expect(state.units[copter]).toBeUndefined();
    expect(state.occupant[at(state, 1, 0)]).toBe(-1);
  });
});
