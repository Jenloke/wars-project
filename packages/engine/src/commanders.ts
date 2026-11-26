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

/** The modifiers in effect for `player` right now: innate, plus the power while it is active. */
export function modifiersOf(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
): CompiledModifiers {
  const side = state.players[player]!;
  const commander = ruleset.commanders[side.commander]!;
  return side.powerActive ? commander.powered : commander.passive;
}
