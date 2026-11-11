import type { Draft } from '../draft';
import { areAdjacent } from '../grid';
import { IMPASSABLE, type CompiledRuleset } from '../ruleset';
import { NO_TILE, NO_UNIT, type TileIndex, type Unit, type UnitId } from '../types';
import { moveBudget } from '../units';

/** An action handler returns null on success or a human-readable error. */
export type ActionError = string | null;

export interface MoveContext {
  readonly unit: Unit;
  readonly destination: TileIndex;
  /** Movement cost of the path, already checked against the unit's budget. */
  readonly cost: number;
}

export type DestinationRule =
  /** The path must end on an empty tile (or the unit's own). */
  | 'empty'
  /** The path must end on another unit of the same player (join, load). */
  | 'friendly';

/**
 * Validates the part every unit action shares: the unit is the active player's,
 * has not acted, and `path` is a legal walk within its movement budget. The path
 * is checked step by step, so it costs O(path length) rather than a full search.
 */
export function beginUnitAction(
  ruleset: CompiledRuleset,
  draft: Draft,
  unitId: UnitId,
  path: readonly TileIndex[],
  destinationRule: DestinationRule,
): MoveContext | string {
  const state = draft.state;
  const unit = state.units[unitId];
  if (unit === undefined) return `Unit ${unitId} does not exist`;
  if (unit.owner !== state.activePlayer) return 'Unit belongs to another player';
  if (unit.moved) return 'Unit has already acted this turn';
  if (unit.pos === NO_TILE) return 'Unit is loaded in a transport';
  if (!Array.isArray(path)) return 'Path must be an array';

  const tileCount = state.width * state.height;
  const costRow = ruleset.units[unit.type]!.moveType * ruleset.terrainCount;
  const budget = moveBudget(ruleset, state, unit);
  const last = path.length - 1;
  let cost = 0;
  let previous = unit.pos;

  for (let i = 0; i <= last; i++) {
    const tile = path[i]!;
    if (!Number.isInteger(tile) || tile < 0 || tile >= tileCount) return 'Path leaves the map';
    if (!areAdjacent(previous, tile, state.width)) return 'Path is not contiguous';
    const step = ruleset.moveCost[costRow + state.terrain[tile]!]!;
    if (step === IMPASSABLE) return 'Path crosses impassable terrain';
    cost += step;
    if (cost > budget) return 'Path exceeds movement range';
    const blocker = state.occupant[tile]!;
    if (blocker !== NO_UNIT && state.units[blocker]!.owner !== unit.owner) {
      return 'Path is blocked by an enemy unit';
    }
    previous = tile;
  }

  const occupantId = state.occupant[previous]!;
  if (destinationRule === 'empty') {
    if (occupantId !== NO_UNIT && occupantId !== unitId) return 'Destination is occupied';
  } else if (occupantId === NO_UNIT || occupantId === unitId) {
    return 'Destination has no unit to join or board';
  }
  return { unit, destination: previous, cost };
}
