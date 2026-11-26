import type { TileIndex, Unit } from '@tactics/engine';
import type { Board } from './board';
import { costsTo, FAR } from './distance';

/** Refuel distance fields, per board (one decision) and move type. */
const fields = new WeakMap<Board, Map<number, Int32Array>>();

/** Per tile: movement cost to the nearest owned property that refuels `moveType`, or `FAR`. */
export function refuelField(board: Board, moveType: number): Int32Array {
  let byMoveType = fields.get(board);
  if (byMoveType === undefined) {
    byMoveType = new Map();
    fields.set(board, byMoveType);
  }
  let field = byMoveType.get(moveType);
  if (field === undefined) {
    const { ruleset, state, me } = board;
    const homes: TileIndex[] = [];
    for (let tile = 0; tile < state.owner.length; tile++) {
      if (state.owner[tile] !== me) continue;
      if (ruleset.terrain[state.terrain[tile]!]!.repairs[moveType] === 1) homes.push(tile);
    }
    field = costsTo(ruleset, state, moveType, homes);
    byMoveType.set(moveType, field);
  }
  return field;
}

function dailyUse(board: Board, unit: Unit): number {
  const def = board.ruleset.units[unit.type]!;
  return unit.dived ? def.divedFuelPerDay : def.fuelPerDay;
}

/**
 * Fuel a unit that is lost on an empty tank needs, standing on `from`, to get back
 * to an owned property that refuels it: the trip, each day's use on the way, and
 * a reserve. 0 for units that never run dry, and for units with nowhere to
 * refuel, which can only fight on.
 */
export function fuelToReturn(board: Board, unit: Unit, from: TileIndex): number {
  const def = board.ruleset.units[unit.type]!;
  if (!def.lostWithoutFuel) return 0;
  const home = refuelField(board, def.moveType)[from]!;
  if (home >= FAR) return 0;
  const turns = Math.ceil(home / Math.max(1, def.movePoints));
  return home + dailyUse(board, unit) * turns + board.profile.fuelReserve;
}

/**
 * True if the unit must turn for home now: after one more day out, its fuel would
 * no longer get it back to refuel before it crashes or sinks.
 */
export function runningDry(board: Board, unit: Unit, from: TileIndex = unit.pos): boolean {
  const need = fuelToReturn(board, unit, from);
  return need > 0 && unit.fuel <= need + dailyUse(board, unit);
}
