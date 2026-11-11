import { weaponBaseDamage } from './combat';
import { neighbours } from './grid';
import { NO_DAMAGE, type CompiledRuleset } from './ruleset';
import { canCaptureAt, canDropAt, canEnterTerrain, canJoinUnits, canLoadInto } from './rules';
import {
  NO_TILE,
  NO_UNIT,
  type GameState,
  type TileIndex,
  type Unit,
  type UnitId,
} from './types';
import { isIndirect, unitCost } from './units';

/**
 * Lists what the rules allow, for menus and (later) the AI. These functions use
 * the same predicates as the reducer, which remains the final authority.
 */

export interface UnloadOption {
  readonly cargo: UnitId;
  readonly tiles: readonly TileIndex[];
}

export interface UnitOptions {
  readonly canWait: boolean;
  readonly canCapture: boolean;
  readonly canSupply: boolean;
  readonly canJoin: boolean;
  readonly canLoad: boolean;
  readonly attackTargets: readonly TileIndex[];
  readonly unloads: readonly UnloadOption[];
}

const scratch = new Int32Array(4);

/**
 * Tiles holding enemies that `unit` could attack from `from`. `hasMoved` is
 * whether reaching `from` used movement, which rules out indirect fire.
 */
export function attackTargetsFrom(
  ruleset: CompiledRuleset,
  state: GameState,
  unit: Unit,
  from: TileIndex,
  hasMoved: boolean,
): TileIndex[] {
  const targets: TileIndex[] = [];
  const def = ruleset.units[unit.type]!;
  if (def.maxRange === 0) return targets;
  if (hasMoved && isIndirect(ruleset, unit.type)) return targets;

  const { width, height, occupant, units } = state;
  const fx = from % width;
  const fy = (from / width) | 0;
  const { minRange, maxRange } = def;

  for (let dy = -maxRange; dy <= maxRange; dy++) {
    const y = fy + dy;
    if (y < 0 || y >= height) continue;
    const span = maxRange - (dy < 0 ? -dy : dy);
    for (let dx = -span; dx <= span; dx++) {
      const x = fx + dx;
      if (x < 0 || x >= width) continue;
      const distance = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
      if (distance < minRange) continue;
      const tile = y * width + x;
      const targetId = occupant[tile]!;
      if (targetId === NO_UNIT) continue;
      const target = units[targetId]!;
      if (target.owner === unit.owner) continue;
      if (weaponBaseDamage(ruleset, unit.type, unit.ammo, target.type) === NO_DAMAGE) continue;
      targets.push(tile);
    }
  }
  return targets;
}

/** True if `unit` may end its move on `tile` (empty, its own, or join/load). */
export function canStopAt(
  ruleset: CompiledRuleset,
  state: GameState,
  unit: Unit,
  tile: TileIndex,
): boolean {
  const occupantId = state.occupant[tile]!;
  if (occupantId === NO_UNIT || occupantId === unit.id) return true;
  const other = state.units[occupantId]!;
  return canJoinUnits(ruleset, unit, other) || canLoadInto(ruleset, unit, other);
}

/** Everything `unitId` could do after moving to `destination`. */
export function getUnitOptions(
  ruleset: CompiledRuleset,
  state: GameState,
  unitId: UnitId,
  destination: TileIndex,
): UnitOptions {
  const unit = state.units[unitId]!;
  const occupantId = state.occupant[destination]!;

  if (occupantId !== NO_UNIT && occupantId !== unitId) {
    const other = state.units[occupantId]!;
    return {
      canWait: false,
      canCapture: false,
      canSupply: false,
      canJoin: canJoinUnits(ruleset, unit, other),
      canLoad: canLoadInto(ruleset, unit, other),
      attackTargets: [],
      unloads: [],
    };
  }

  const hasMoved = destination !== unit.pos;
  const vacated = hasMoved ? unit.pos : NO_TILE;
  const adjacentCount = neighbours(destination, state.width, state.height, scratch);

  let canSupply = false;
  if (ruleset.units[unit.type]!.canSupply) {
    for (let i = 0; i < adjacentCount; i++) {
      const tile = scratch[i]!;
      const id = tile === vacated ? NO_UNIT : state.occupant[tile]!;
      if (id !== NO_UNIT && id !== unitId && state.units[id]!.owner === unit.owner) {
        canSupply = true;
        break;
      }
    }
  }

  const unloads: UnloadOption[] = [];
  for (const cargoId of unit.cargo) {
    const cargo = state.units[cargoId]!;
    if (!canEnterTerrain(ruleset, state, cargo.type, destination)) continue;
    const tiles: TileIndex[] = [];
    for (let i = 0; i < adjacentCount; i++) {
      const tile = scratch[i]!;
      if (canDropAt(ruleset, state, cargo, tile, vacated)) tiles.push(tile);
    }
    if (tiles.length > 0) unloads.push({ cargo: cargoId, tiles });
  }

  return {
    canWait: true,
    canCapture: canCaptureAt(ruleset, state, unit, destination),
    canSupply,
    canJoin: false,
    canLoad: false,
    attackTargets: attackTargetsFrom(ruleset, state, unit, destination, hasMoved),
    unloads,
  };
}

export interface BuildOption {
  readonly unitType: number;
  readonly cost: number;
  readonly affordable: boolean;
}

/** Units the active player can build at `tile`. Empty if they cannot build there. */
export function getBuildOptions(
  ruleset: CompiledRuleset,
  state: GameState,
  tile: TileIndex,
): BuildOption[] {
  const player = state.activePlayer;
  if (state.owner[tile] !== player || state.occupant[tile] !== NO_UNIT) return [];
  const funds = state.players[player]!.funds;
  return ruleset.terrain[state.terrain[tile]!]!.builds.map((unitType) => {
    const cost = unitCost(ruleset, state, player, unitType);
    return { unitType, cost, affordable: cost <= funds };
  });
}
