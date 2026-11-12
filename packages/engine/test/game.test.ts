import { describe, expect, it } from 'vitest';
import { applyAction, hashState, replay, type Action, type GameState } from '../src/index';
import {
  apply,
  deepFreeze,
  makeGame,
  reject,
  rules,
  SCRIPT_ROWS,
  scriptedActions,
  unitAt,
} from './fixtures';

describe('turns', () => {
  it('alternates players, counts days, pays income and refreshes units', () => {
    let state = makeGame(['Rc.', '..b'], [{ x: 2, y: 0, type: 'infantry', owner: 0 }]);
    const id = unitAt(state, 2, 0).id;
    expect(state).toMatchObject({ day: 1, activePlayer: 0 });
    expect(state.players[0]!.funds).toBe(2000);
    expect(state.players[1]!.funds).toBe(0);

    state = apply(state, { type: 'Move', unit: id, path: [] }).state;
    expect(state.units[id]!.moved).toBe(true);

    const toP2 = apply(state, { type: 'EndTurn' });
    state = toP2.state;
    expect(state).toMatchObject({ day: 1, activePlayer: 1 });
    expect(state.players[1]!.funds).toBe(1000);
    expect(state.units[id]!.moved).toBe(false);
    expect(toP2.events).toContainEqual({ type: 'TurnStarted', player: 1, day: 1 });

    state = apply(state, { type: 'EndTurn' }).state;
    expect(state).toMatchObject({ day: 2, activePlayer: 0 });
    expect(state.players[0]!.funds).toBe(4000);
  });
});

describe('win conditions', () => {
  it('routs a player who loses their last unit', () => {
    const state = makeGame(
      ['====='],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1, hp: 10 },
      ],
    );
    const result = apply(state, {
      type: 'Attack',
      unit: unitAt(state, 0, 0).id,
      path: [],
      target: 1,
    });
    expect(result.state.status).toEqual({ kind: 'won', winner: 0, reason: 'rout' });
    expect(result.events.map((event) => event.type)).toEqual([
      'Attacked',
      'UnitDestroyed',
      'PlayerDefeated',
      'GameWon',
    ]);
  });

  it('does not rout a player who simply has not built yet', () => {
    const state = makeGame(['R.b']);
    expect(apply(state, { type: 'EndTurn' }).state.status.kind).toBe('playing');
  });

  it('ends the game on resignation', () => {
    const state = makeGame(['R.b']);
    const next = apply(state, { type: 'Resign' }).state;
    expect(next.status).toEqual({ kind: 'won', winner: 1, reason: 'resign' });
  });
});

function scriptedGame(seed: number): { initial: GameState; actions: Action[] } {
  return { initial: makeGame(SCRIPT_ROWS, [], seed), actions: scriptedActions() };
}

describe('determinism and serialization', () => {
  it('produces the same state hash from the same seed and action log', () => {
    const a = scriptedGame(42);
    const b = scriptedGame(42);
    expect(hashState(replay(rules, a.initial, a.actions))).toBe(
      hashState(replay(rules, b.initial, b.actions)),
    );
  });

  it('produces a different hash from a different seed', () => {
    const hashes = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => {
        const game = scriptedGame(seed);
        return hashState(replay(rules, game.initial, game.actions));
      }),
    );
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('survives a save and load round trip mid-game', () => {
    const { initial, actions } = scriptedGame(42);
    const midpoint = replay(rules, initial, actions.slice(0, 7));
    const loaded = JSON.parse(JSON.stringify(midpoint)) as GameState;
    expect(loaded).toEqual(midpoint);
    expect(hashState(loaded)).toBe(hashState(midpoint));

    const rest = actions.slice(7);
    expect(replay(rules, loaded, rest)).toEqual(replay(rules, midpoint, rest));
  });

  it('never mutates the state it is given', () => {
    const { initial, actions } = scriptedGame(42);
    let state = deepFreeze(initial);
    for (const action of actions) {
      // A frozen input would throw on any in-place write.
      const result = applyAction(rules, state, action);
      if (!result.ok) throw new Error(result.error);
      state = deepFreeze(result.state);
    }
    expect(state).toMatchObject({ day: 3, activePlayer: 1 });
  });

  it('leaves the state untouched when an action is rejected', () => {
    const { initial } = scriptedGame(42);
    const before = hashState(initial);
    expect(reject(initial, { type: 'Build', at: 6, unitType: 0 })).toMatch(/do not own/);
    expect(hashState(initial)).toBe(before);
  });

  it('shares untouched arrays between successive states', () => {
    const { initial } = scriptedGame(42);
    const next = apply(initial, { type: 'EndTurn' }).state;
    expect(next.terrain).toBe(initial.terrain);
    expect(next.occupant).toBe(initial.occupant);
    expect(next.units).toBe(initial.units);
  });
});
