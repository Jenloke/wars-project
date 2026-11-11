import type { CompiledRuleset } from './ruleset';
import type { GameState, TileIndex, Unit } from './types';

/**
 * Predicates shared by action validation and by option listing, so the menu the
 * player sees and the rules the reducer enforces cannot drift apart.
 */

export function canCaptureAt(
  ruleset: CompiledRuleset,
  state: GameState,
  unit: Unit,
  tile: TileIndex,
): boolean {
  return (
    ruleset.units[unit.type]!.canCapture &&
    ruleset.terrain[state.terrain[tile]!]!.isProperty &&
    state.owner[tile] !== unit.owner
  );
}
