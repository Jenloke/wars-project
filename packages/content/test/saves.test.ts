import {
  applyAction,
  compileRuleset,
  createGame,
  createSave,
  SaveError,
  type Action,
  type GameRecord,
  type GameSetup,
  type GameState,
  type SaveErrorCode,
} from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { actionSchema, readSave, ruleset, twinFords } from '../src/index';

const compiled = compileRuleset(ruleset);
const SAVED_AT = '2026-11-12T09:30:00.000Z';
const tileAt = (x: number, y: number) => y * twinFords.width + x;

/** Opening turns on Twin Fords: both sides build, then player 1 starts a capture. */
function openingGame(): GameRecord {
  const setup: GameSetup = { seed: 7, players: [{ controller: 'local' }, { controller: 'local' }] };
  const infantry = compiled.unitIndex.get('infantry')!;
  const actions: Action[] = [
    { type: 'Build', at: tileAt(2, 1), unitType: infantry },
    { type: 'EndTurn' },
    { type: 'Build', at: tileAt(14, 7), unitType: infantry },
    { type: 'EndTurn' },
    { type: 'Capture', unit: 1, path: [tileAt(2, 2), tileAt(2, 3)] },
    { type: 'EndTurn' },
  ];
  let state: GameState = createGame(compiled, twinFords, setup);
  for (const action of actions) {
    const result = applyAction(compiled, state, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return { map: twinFords, setup, actions, state };
}

function saveText(record: GameRecord = openingGame()): string {
  return JSON.stringify(createSave(compiled, record, SAVED_AT));
}

/** Parses saved text, applies `edit` to the raw JSON, and serializes it again. */
function edited(edit: (save: Record<string, unknown>) => unknown): string {
  return JSON.stringify(edit(JSON.parse(saveText()) as Record<string, unknown>));
}

function expectRejected(text: string, code: SaveErrorCode, message: RegExp): void {
  try {
    readSave(text, compiled);
  } catch (error) {
    if (!(error instanceof SaveError)) throw error;
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    return;
  }
  throw new Error('Expected the save to be rejected');
}

describe('readSave', () => {
  it('loads a saved Twin Fords game to an identical state', () => {
    const record = openingGame();
    const restored = readSave(saveText(record), compiled);
    expect(restored.state).toEqual(record.state);
    expect(restored.actions).toEqual(record.actions);
    expect(restored.map).toEqual(record.map);
    expect(restored.state.capture[tileAt(2, 3)]).toBe(10);
  });

  it('rejects text that is not a save', () => {
    expectRejected('{"name": "not a save"', 'malformed', /not valid JSON/);
    expectRejected('{"name": "not a save"}', 'malformed', /not a saved game/);
  });

  it('names the damaged field', () => {
    expectRejected(
      edited((save) => ({ ...save, actions: [{ type: 'Teleport', unit: 1 }] })),
      'malformed',
      /actions\.0/,
    );
    expectRejected(
      edited((save) => ({ ...save, setup: { seed: -1, players: [] } })),
      'malformed',
      /setup\.seed/,
    );
  });

  it('rejects an invalid embedded map', () => {
    const tiles = twinFords.tiles.map((id) => (id === 'hq' ? 'plains' : id));
    const properties = twinFords.properties.filter(
      (p) => twinFords.tiles[p.y * twinFords.width + p.x] !== 'hq',
    );
    expectRejected(
      edited((save) => ({ ...save, map: { ...twinFords, tiles, properties } })),
      'malformed',
      /saved map is invalid: Player 0 has 0 HQs/,
    );
  });

  it('rejects saves from a newer build and from other rules', () => {
    expectRejected(
      edited((save) => ({ ...save, version: 99 })),
      'unsupportedVersion',
      /newer version/,
    );
    expectRejected(
      edited((save) => ({ ...save, rulesetId: 'core-0' })),
      'rulesetMismatch',
      /core-0/,
    );
  });

  it('rejects a save whose log was tampered with', () => {
    expectRejected(
      edited((save) => ({ ...save, actions: (save['actions'] as unknown[]).slice(0, 2) })),
      'corrupt',
      /does not match/,
    );
  });
});

describe('actionSchema', () => {
  it('accepts every action type and keeps its fields', () => {
    const actions: Action[] = [
      { type: 'Move', unit: 1, path: [2, 3] },
      { type: 'Attack', unit: 1, path: [], target: 4 },
      { type: 'Capture', unit: 1, path: [5] },
      { type: 'Join', unit: 1, path: [5] },
      { type: 'Load', unit: 1, path: [5] },
      { type: 'Unload', unit: 1, path: [5], drops: [{ cargo: 2, to: 6 }] },
      { type: 'Supply', unit: 1, path: [] },
      { type: 'Build', at: 0, unitType: 3 },
      { type: 'EndTurn' },
      { type: 'Resign' },
    ];
    for (const action of actions) expect(actionSchema.parse(action)).toEqual(action);
  });

  it('rejects malformed actions', () => {
    for (const action of [
      { type: 'Move', unit: 1 },
      { type: 'Move', unit: 1.5, path: [] },
      { type: 'Attack', unit: 1, path: [-1], target: 0 },
      { type: 'Unload', unit: 1, path: [], drops: [] },
      { type: 'Move', unit: 1, path: Array.from({ length: 65 }, (_unused, i) => i) },
    ]) {
      expect(actionSchema.safeParse(action).success).toBe(false);
    }
  });
});
