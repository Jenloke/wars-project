import {
  defenceStars,
  hpPips,
  NO_TILE,
  NO_UNIT,
  type CompiledRuleset,
  type GameState,
  type TileIndex,
  type Unit,
  type UnitId,
} from '@tactics/engine';
import type { UiState } from '../store/uiStore';

type Selection = Pick<UiState, 'mode' | 'cursor' | 'selectedUnit' | 'path'>;

/**
 * The unit the info panel describes: the one under the cursor or, while the
 * player is moving a unit, that unit once the cursor is on the tile it would
 * end its move on.
 */
export function shownUnit(state: GameState, ui: Selection): UnitId {
  if (ui.cursor === NO_TILE || ui.cursor >= state.occupant.length) return NO_UNIT;
  const here = state.occupant[ui.cursor]!;
  if (here !== NO_UNIT) return here;
  if (ui.mode !== 'moving' && ui.mode !== 'actionMenu') return NO_UNIT;
  const unit = state.units[ui.selectedUnit];
  if (unit === undefined) return NO_UNIT;
  const destination = ui.path.length > 0 ? ui.path[ui.path.length - 1]! : unit.pos;
  return destination === ui.cursor ? ui.selectedUnit : NO_UNIT;
}

/** How much a tile shields a unit from attack. */
export interface Cover {
  /** Defence stars the unit gets there: none for units that take no cover. */
  readonly stars: number;
  /**
   * Percent less damage the unit takes there. Each star is worth one percent per
   * HP pip the defender has, as in the damage formula.
   */
  readonly percent: number;
}

/** The cover `unit` gets on `tile`, at its current HP. */
export function coverOf(
  ruleset: CompiledRuleset,
  state: GameState,
  unit: Unit,
  tile: TileIndex,
): Cover {
  const stars = defenceStars(ruleset, state, unit.type, tile);
  return { stars, percent: stars * hpPips(ruleset, unit.hp) };
}

/** Percent less damage a unit at full HP takes from `stars` of terrain defence. */
export function fullHpCover(ruleset: CompiledRuleset, stars: number): number {
  return (stars * ruleset.rules.maxHp) / ruleset.rules.hpPerPip;
}

/** A gauge's colour band. */
export type Level = 'high' | 'mid' | 'low';

/** At or below this fraction a gauge is low; above `MID` it is high. */
export const LOW_FRACTION = 0.3;
const MID_FRACTION = 0.6;

export function levelOf(value: number, max: number): Level {
  if (max <= 0 || value <= max * LOW_FRACTION) return 'low';
  return value <= max * MID_FRACTION ? 'mid' : 'high';
}
