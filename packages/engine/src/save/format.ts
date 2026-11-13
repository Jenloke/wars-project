import type { GameSetup } from '../createGame';
import type { CompiledRuleset } from '../ruleset';
import type { Action, GameState, MapData } from '../types';

/** Marks a JSON document as a save file, so unrelated JSON is rejected early. */
export const SAVE_FORMAT = 'tactics-save';

/**
 * Version of the save format. Bump it, and add a migration from the previous
 * version in `migrations.ts`, whenever the shape of `SaveData`, `GameState`,
 * `Action` or `MapData` changes.
 */
export const SAVE_VERSION = 1;

/**
 * Everything needed to reproduce a game exactly: the map and setup rebuild the
 * initial state, and the actions replay it to `state`.
 */
export interface GameRecord {
  readonly map: MapData;
  readonly setup: GameSetup;
  readonly actions: readonly Action[];
  /** State after the last action. */
  readonly state: GameState;
}

/**
 * A save file. The map is embedded rather than referenced by ID, so games on
 * imported or edited maps load anywhere. `state` is a snapshot for display and
 * verification; loading always rebuilds the state from the action log.
 */
export interface SaveData extends GameRecord {
  readonly format: typeof SAVE_FORMAT;
  readonly version: number;
  /** ID of the ruleset the log was played under. */
  readonly rulesetId: string;
  /** ISO 8601 time of saving. Supplied by the caller: the engine has no clock. */
  readonly savedAt: string;
}

export function createSave(
  ruleset: CompiledRuleset,
  record: GameRecord,
  savedAt: string,
): SaveData {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    rulesetId: ruleset.id,
    savedAt,
    map: record.map,
    setup: record.setup,
    actions: record.actions,
    state: record.state,
  };
}
