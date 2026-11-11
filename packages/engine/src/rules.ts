import { IMPASSABLE, type CompiledRuleset } from './ruleset';
import { NO_UNIT, type GameState, type TileIndex, type Unit } from './types';
import { hpPips, maxPips } from './units';

/**
 * Predicates shared by action validation and by option listing, so the menu the
 * player sees and the rules the reducer enforces cannot drift apart.
 */

export function canJoinUnits(ruleset: CompiledRuleset, mover: Unit, target: Unit): boolean {
  return (
    mover.id !== target.id &&
    mover.owner === target.owner &&
    mover.type === target.type &&
    mover.cargo.length === 0 &&
    target.cargo.length === 0 &&
    hpPips(ruleset, target.hp) < maxPips(ruleset)
  );
}

export function canLoadInto(ruleset: CompiledRuleset, mover: Unit, transport: Unit): boolean {
  const def = ruleset.units[transport.type]!;
  return (
    mover.id !== transport.id &&
    mover.owner === transport.owner &&
    transport.cargo.length < def.capacity &&
    def.carries[ruleset.units[mover.type]!.moveType] === 1
  );
}

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

export function canEnterTerrain(
  ruleset: CompiledRuleset,
  state: GameState,
  unitType: number,
  tile: TileIndex,
): boolean {
  const row = ruleset.units[unitType]!.moveType * ruleset.terrainCount;
  return ruleset.moveCost[row + state.terrain[tile]!] !== IMPASSABLE;
}

/**
 * True if `cargo` can be dropped on `tile`. The tile must be enterable and empty;
 * `vacated` is a tile to treat as empty (the transport's origin once it has moved).
 */
export function canDropAt(
  ruleset: CompiledRuleset,
  state: GameState,
  cargo: Unit,
  tile: TileIndex,
  vacated: TileIndex,
): boolean {
  if (!canEnterTerrain(ruleset, state, cargo.type, tile)) return false;
  return tile === vacated || state.occupant[tile] === NO_UNIT;
}
