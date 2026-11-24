import {
  asciiToMap,
  defaultLegend,
  ruleset as rawRuleset,
  type AsciiLegend,
} from '@tactics/content';
import {
  applyAction,
  compileRuleset,
  createGame,
  type Action,
  type GameState,
  type Player,
  type TileIndex,
  type Unit,
} from '@tactics/engine';
import { chooseAction } from '../src/index';

/** The real rules: the AI is judged on the game it will actually play. */
export const rules = compileRuleset(rawRuleset);

/** The content legend plus owned cities: `c` for player 1, `d` for player 2. */
const LEGEND: AsciiLegend = {
  ...defaultLegend,
  c: { terrain: 'city', owner: 0 },
  d: { terrain: 'city', owner: 1 },
};

export interface PlacedUnit {
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly owner: number;
  readonly hp?: number;
}

/** A two-player game on `rows`, player 1 to move, both seats played by the AI. */
export function makeGame(
  rows: readonly string[],
  units: readonly PlacedUnit[] = [],
  funds: readonly [number, number] = [0, 0],
): GameState {
  const map = {
    ...asciiToMap(
      rows.join('\n'),
      {
        id: 'test',
        name: 'Test',
        author: 'test',
        playerCount: 2,
        startingFunds: 0,
        incomePerProperty: 1000,
      },
      LEGEND,
    ),
    units,
  };
  const state = createGame(rules, map, {
    seed: 1,
    players: [{ controller: 'ai' }, { controller: 'ai' }],
  });
  return {
    ...state,
    players: state.players.map((player, i): Player => ({ ...player, funds: funds[i]! })),
  };
}

export function at(state: GameState, x: number, y: number): TileIndex {
  return y * state.width + x;
}

export function unitAt(state: GameState, x: number, y: number): Unit {
  const unit = state.units[state.occupant[at(state, x, y)]!];
  if (unit === undefined) throw new Error(`No unit at (${x},${y})`);
  return unit;
}

export function unitType(id: string): number {
  return rules.unitIndex.get(id)!;
}

export function withCapture(state: GameState, tile: TileIndex, remaining: number): GameState {
  const capture = state.capture.slice();
  capture[tile] = remaining;
  return { ...state, capture };
}

export function apply(state: GameState, action: Action): GameState {
  const result = applyAction(rules, state, action);
  if (!result.ok) throw new Error(`Illegal ${JSON.stringify(action)}: ${result.error}`);
  return result.state;
}

/** Where an action leaves its unit: the end of its path, or where it stood. */
export function destination(state: GameState, action: Action): TileIndex {
  if (!('unit' in action)) throw new Error(`${action.type} has no unit`);
  return action.path.length > 0
    ? action.path[action.path.length - 1]!
    : state.units[action.unit]!.pos;
}

/**
 * Plays the active player's whole turn with the AI: until it ends the turn (the
 * last action) or the game is over. Fails if a turn runs on without ending.
 */
export function playTurn(state: GameState): { state: GameState; actions: Action[] } {
  const actions: Action[] = [];
  for (let i = 0; i < 500; i++) {
    if (state.status.kind !== 'playing') return { state, actions };
    const action = chooseAction(rules, state);
    actions.push(action);
    state = apply(state, action);
    if (action.type === 'EndTurn') return { state, actions };
  }
  throw new Error('The AI did not end its turn');
}
