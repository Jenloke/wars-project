import { DEFAULT_MAP_ID, maps } from '@tactics/content';
import { createGame, type Action, type GameState } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';
import { apply, makeGame, playTurn, rules } from './fixtures';

function twinFords(seed: number): GameState {
  return createGame(rules, maps.get(DEFAULT_MAP_ID), {
    seed,
    players: [{ controller: 'ai' }, { controller: 'ai' }],
  });
}

/** Plays until the game ends or `days` pass. `passive` players only end their turn. */
function playOut(
  state: GameState,
  days: number,
  passive: readonly number[] = [],
): { state: GameState; actions: Action[] } {
  const actions: Action[] = [];
  while (state.status.kind === 'playing' && state.day <= days) {
    if (passive.includes(state.activePlayer)) {
      actions.push({ type: 'EndTurn' });
      state = apply(state, { type: 'EndTurn' });
      continue;
    }
    const turn = playTurn(state);
    actions.push(...turn.actions);
    state = turn.state;
  }
  return { state, actions };
}

function propertiesOf(state: GameState, player: number): number {
  return state.owner.filter((owner) => owner === player).length;
}

describe('full games on Twin Fords', () => {
  it.each([0, 1])('beats an opponent that never moves, playing seat %i', (seat) => {
    const { state } = playOut(twinFords(7), 20, [1 - seat]);
    expect(state.status).toMatchObject({ kind: 'won', winner: seat });
  });

  it('plays itself with legal actions: building, capturing and fighting', () => {
    const { state, actions } = playOut(twinFords(3), 25);
    const kinds = new Set(actions.map((action) => action.type));
    for (const kind of ['Build', 'Capture', 'Move', 'Attack', 'EndTurn']) {
      expect(kinds).toContain(kind);
    }
    if (state.status.kind === 'playing') {
      expect(propertiesOf(state, 0)).toBeGreaterThanOrEqual(5);
      expect(propertiesOf(state, 1)).toBeGreaterThanOrEqual(5);
    }
  });

  it('is deterministic: the same game plays out the same way', () => {
    const first = playOut(twinFords(11), 8).actions;
    const second = playOut(twinFords(11), 8).actions;
    expect(second).toEqual(first);
  });
});

describe('fair play', () => {
  it('does not read the luck seed', () => {
    const state = makeGame(
      ['.....', '.....'],
      [
        { x: 1, y: 0, type: 'tank', owner: 0 },
        { x: 2, y: 0, type: 'infantry', owner: 1 },
        { x: 1, y: 1, type: 'mech', owner: 1 },
      ],
    );
    const action = chooseAction(rules, state);
    for (const rng of [0, 1, 0x12345678, 0xffffffff]) {
      expect(chooseAction(rules, { ...state, rng })).toEqual(action);
    }
  });

  it('only ends the turn once the game is over', () => {
    const state = makeGame(['...'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const over: GameState = { ...state, status: { kind: 'won', winner: 1, reason: 'hq' } };
    expect(chooseAction(rules, over)).toEqual({ type: 'EndTurn' });
  });
});

describe('performance', () => {
  /** A 30 x 20 map with scattered forest and roads, the size the game targets. */
  function largeMap(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 20; y++) {
      let row = '';
      for (let x = 0; x < 30; x++) {
        if (x === 0 && y === 0) row += 'R';
        else if (x === 29 && y === 19) row += 'b';
        else row += (x * 7 + y * 13) % 5 === 0 ? 'F' : x % 6 === 3 ? '=' : '.';
      }
      rows.push(row);
    }
    return rows;
  }

  it('plays a turn with 20 units a side on a 30x20 map within budget', () => {
    const kinds = ['infantry', 'tank', 'artillery', 'mech', 'recon'];
    const units = [];
    for (let i = 0; i < 20; i++) {
      units.push({ x: 4 + (i % 5) * 2, y: (i * 3) % 20, type: kinds[i % 5]!, owner: 0 });
      units.push({ x: 16 + (i % 5) * 2, y: (i * 7) % 20, type: kinds[(i + 2) % 5]!, owner: 1 });
    }
    const state = makeGame(largeMap(), units, [20000, 20000]);
    const start = Date.now();
    const { actions } = playTurn(state);
    const elapsed = Date.now() - start;
    expect(actions.length).toBeGreaterThan(10);
    expect(elapsed).toBeLessThan(2000);
  });
});
