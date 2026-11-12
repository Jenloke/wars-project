import { applyAction } from '../applyAction';
import { createGame } from '../createGame';
import type { CompiledRuleset } from '../ruleset';
import type { GameState } from '../types';
import { SaveError } from './errors';
import type { GameRecord, SaveData } from './format';

/** A game rebuilt from a save, with the initial state its log replays from. */
export interface RestoredGame extends GameRecord {
  readonly initial: GameState;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rebuilds a game from a save by replaying its action log from the map, then
 * checks the result matches the saved state exactly. The saved state is never
 * trusted on its own: a save that was edited, truncated or played under other
 * rules fails here instead of producing a game that cannot be replayed.
 *
 * Cost is one replay of the log plus two serializations of the final state.
 */
export function restoreSave(ruleset: CompiledRuleset, save: SaveData): RestoredGame {
  if (save.rulesetId !== ruleset.id) {
    throw new SaveError(
      'rulesetMismatch',
      `This save was played under ruleset "${save.rulesetId}", but this build uses "${ruleset.id}".`,
    );
  }

  let initial: GameState;
  try {
    initial = createGame(ruleset, save.map, save.setup);
  } catch (error) {
    throw new SaveError('corrupt', `The saved game could not be set up: ${reason(error)}`);
  }

  const { actions } = save;
  let state = initial;
  for (let i = 0; i < actions.length; i++) {
    const result = applyAction(ruleset, state, actions[i]!);
    if (!result.ok) {
      throw new SaveError(
        'corrupt',
        `Action ${i + 1} of ${actions.length} in the save is not legal: ${result.error}`,
      );
    }
    state = result.state;
  }

  // Replay is deterministic and builds objects in a fixed key order, so an
  // untouched save serializes identically. Exact comparison, not a hash.
  if (JSON.stringify(state) !== JSON.stringify(save.state)) {
    throw new SaveError('corrupt', 'The saved game state does not match its action log.');
  }
  return { map: save.map, setup: save.setup, actions, initial, state };
}
