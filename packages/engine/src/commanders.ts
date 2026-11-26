import type { CompiledCommander, CompiledModifiers, CompiledRuleset } from './ruleset';
import type { GameState, PlayerIndex } from './types';

/** The commander leading `player`. */
export function commanderOf(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
): CompiledCommander {
  return ruleset.commanders[state.players[player]!.commander]!;
}

/** The modifiers in effect for `player` right now. */
export function modifiersOf(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
): CompiledModifiers {
  return commanderOf(ruleset, state, player).passive;
}
