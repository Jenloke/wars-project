import { NO_TILE, NO_UNIT, type GameState, type UnitId } from '@tactics/engine';
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
