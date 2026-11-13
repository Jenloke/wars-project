import { describe, expect, it } from 'vitest';
import {
  compileRuleset,
  createGame,
  createSave,
  hashState,
  replay,
  restoreSave,
  SaveError,
  type GameRecord,
  type GameSetup,
  type SaveData,
  type SaveErrorCode,
} from '../src/index';
import { apply, makeMap, rules, SCRIPT_ROWS, scriptedActions, testRuleset } from './fixtures';

const SAVED_AT = '2026-11-12T09:30:00.000Z';

/** A game played `actionCount` actions into the scripted game. */
function playedGame(actionCount: number, seed = 42): GameRecord {
  const map = makeMap(SCRIPT_ROWS);
  const setup: GameSetup = { seed, players: [{ controller: 'local' }, { controller: 'local' }] };
  const actions = scriptedActions().slice(0, actionCount);
  const state = replay(rules, createGame(rules, map, setup), actions);
  return { map, setup, actions, state };
}

/** Serializes a save the way a file or browser storage would. */
function throughJson(save: SaveData): SaveData {
  return JSON.parse(JSON.stringify(save)) as SaveData;
}

function saveErrorOf(load: () => unknown): SaveError {
  try {
    load();
  } catch (error) {
    if (error instanceof SaveError) return error;
    throw error;
  }
  throw new Error('Expected the save to be rejected');
}

function expectRejected(load: () => unknown, code: SaveErrorCode, message?: RegExp): void {
  const error = saveErrorOf(load);
  expect(error.code).toBe(code);
  if (message !== undefined) expect(error.message).toMatch(message);
}

describe('save and load', () => {
  it('round-trips a mid-game save to an identical state', () => {
    const record = playedGame(7);
    const save = throughJson(createSave(rules, record, SAVED_AT));
    const restored = restoreSave(rules, save);

    expect(restored.state).toEqual(record.state);
    expect(hashState(restored.state)).toBe(hashState(record.state));
    expect(restored.actions).toEqual(record.actions);
    expect(restored.initial).toEqual(createGame(rules, record.map, record.setup));
  });

  it('continues a loaded game exactly as the original would have', () => {
    const record = playedGame(7);
    const restored = restoreSave(rules, throughJson(createSave(rules, record, SAVED_AT)));
    const rest = scriptedActions().slice(7);
    expect(replay(rules, restored.state, rest)).toEqual(replay(rules, record.state, rest));
  });

  it('round-trips a new game and a finished game', () => {
    const fresh = playedGame(0);
    expect(restoreSave(rules, throughJson(createSave(rules, fresh, SAVED_AT))).state).toEqual(
      fresh.state,
    );

    const played = playedGame(12);
    const finished = { ...played, actions: [...played.actions, { type: 'Resign' as const }] };
    const ended = { ...finished, state: apply(played.state, { type: 'Resign' }).state };
    const restored = restoreSave(rules, throughJson(createSave(rules, ended, SAVED_AT)));
    expect(restored.state.status).toEqual({ kind: 'won', winner: 0, reason: 'resign' });
  });

  it('stamps the format, version, ruleset and time', () => {
    const save = createSave(rules, playedGame(1), SAVED_AT);
    expect(save).toMatchObject({
      format: 'tactics-save',
      version: 1,
      rulesetId: 'test',
      savedAt: SAVED_AT,
    });
  });
});

describe('save verification', () => {
  const validSave = () => throughJson(createSave(rules, playedGame(7), SAVED_AT));

  it('rejects a save whose state was edited', () => {
    const save = validSave();
    const players = save.state.players.map((player) => ({ ...player, funds: 99_000 }));
    const edited = { ...save, state: { ...save.state, players } };
    expectRejected(() => restoreSave(rules, edited), 'corrupt', /does not match/);
  });

  it('rejects a truncated action log', () => {
    const save = validSave();
    const truncated = { ...save, actions: save.actions.slice(0, -1) };
    expectRejected(() => restoreSave(rules, truncated), 'corrupt', /does not match/);
  });

  it('names the first illegal action in the log', () => {
    const save = validSave();
    const actions = [...save.actions];
    actions[0] = { type: 'Build', at: 0, unitType: 999 };
    expectRejected(
      () => restoreSave(rules, { ...save, actions }),
      'corrupt',
      /Action 1 of 7 .*cannot be built/,
    );
  });

  it('rejects a save played under another ruleset', () => {
    const save = validSave();
    const other = compileRuleset({ ...testRuleset, id: 'test-2' });
    expectRejected(() => restoreSave(other, save), 'rulesetMismatch', /"test".*"test-2"/);
  });

  it('rejects a map that cannot be set up', () => {
    const save = validSave();
    const map = { ...save.map, tiles: save.map.tiles.map(() => 'lava') };
    expectRejected(() => restoreSave(rules, { ...save, map }), 'corrupt', /lava/);
  });
});
