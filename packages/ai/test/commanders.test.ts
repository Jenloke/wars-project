import { asciiToMap, defaultLegend, ruleset as rawRuleset } from '@tactics/content';
import {
  compileRuleset,
  createGame,
  type CompiledRuleset,
  type GameState,
  type RawCommanderDef,
} from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { readBoard } from '../src/board';
import { chooseAction } from '../src/index';
import { propertyValue } from '../src/plan';
import { DEFAULT_PROFILE } from '../src/profile';
import { findTactics } from '../src/tactics';
import { at, type PlacedUnit } from './fixtures';

const PLAINS = ['.........', '.........', '.........'];

/** The shipped rules plus a commander `test`, so the AI is judged on real units. */
function rulesWith(commander: Omit<RawCommanderDef, 'id' | 'name'>): CompiledRuleset {
  return compileRuleset({
    ...rawRuleset,
    commanders: [...rawRuleset.commanders, { id: 'test', name: 'Test', ...commander }],
  });
}

/** Player 1 led by `firstCommander`, player 2 by `secondCommander`; player 1 to move. */
function makeGame(
  ruleset: CompiledRuleset,
  rows: readonly string[],
  units: readonly PlacedUnit[],
  firstCommander: string | undefined,
  secondCommander: string | undefined,
  meter = 0,
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
      defaultLegend,
    ),
    units,
  };
  const state = createGame(ruleset, map, {
    seed: 1,
    players: [
      { controller: 'ai', commander: firstCommander },
      { controller: 'ai', commander: secondCommander },
    ],
  });
  return { ...state, players: state.players.map((p) => ({ ...p, power: meter })) };
}

describe('the AI and commanders', () => {
  it('reads enemy indirect fire at the range their commander gives it', () => {
    const ruleset = rulesWith({ modifiers: [{ hook: 'range', value: 1 }] });
    const units: PlacedUnit[] = [
      { x: 0, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'artillery', owner: 1 },
    ];
    const plain = readBoard(
      ruleset,
      makeGame(ruleset, PLAINS, units, undefined, undefined),
      DEFAULT_PROFILE,
    );
    const state = makeGame(ruleset, PLAINS, units, undefined, 'test');
    const board = readBoard(ruleset, state, DEFAULT_PROFILE);
    expect(plain.attackers[at(state, 4, 1)]).toBeUndefined();
    expect(board.attackers[at(state, 4, 1)]).toHaveLength(1);
    expect(board.attackers[at(state, 3, 1)]).toBeUndefined();
  });

  it('banks a capture its commander finishes in one turn', () => {
    const rows = ['C........', '.........'];
    const units: PlacedUnit[] = [
      { x: 1, y: 0, type: 'infantry', owner: 0 },
      { x: 8, y: 1, type: 'infantry', owner: 1 },
    ];
    const captureAt = (ruleset: CompiledRuleset, commander: string | undefined) => {
      const state = makeGame(ruleset, rows, units, commander, undefined);
      const board = readBoard(ruleset, state, DEFAULT_PROFILE);
      const tactic = findTactics(board).find((t) => t.kind === 'Capture')!;
      return { tactic, full: propertyValue(board, 0) };
    };
    const ruleset = rulesWith({ modifiers: [{ hook: 'capture', value: 100 }] });
    const quick = captureAt(ruleset, 'test');
    expect(quick.tactic.score).toBe(quick.full);
    expect(captureAt(ruleset, undefined).tactic.score).toBeLessThan(quick.full);
  });

  it('activates its power as soon as the meter is full, and not before', () => {
    const ruleset = rulesWith({
      modifiers: [],
      power: { name: 'Volley', cost: 1000, modifiers: [{ hook: 'attack', value: 30 }] },
    });
    const units: PlacedUnit[] = [
      { x: 0, y: 0, type: 'tank', owner: 0 },
      { x: 8, y: 1, type: 'tank', owner: 1 },
    ];
    const ready = makeGame(ruleset, PLAINS, units, 'test', undefined, 1000);
    expect(chooseAction(ruleset, ready)).toEqual({ type: 'ActivatePower' });
    const short = makeGame(ruleset, PLAINS, units, 'test', undefined, 999);
    expect(chooseAction(ruleset, short).type).not.toBe('ActivatePower');
    // A commander without a power never tries, however full the meter.
    const none = makeGame(ruleset, PLAINS, units, undefined, undefined, 50_000);
    expect(chooseAction(ruleset, none).type).not.toBe('ActivatePower');
  });
});
