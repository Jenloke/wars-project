import { hpPips, NO_OWNER, NO_UNIT, type TileIndex, type Unit, type UnitId } from '@tactics/engine';
import type { Board } from './board';
import { costsFrom, FAR } from './distance';
import { runningDry } from './fuel';

/** Decisions that span the whole army, made once per position. */
export interface Plan {
  /** Property each capturing unit is heading for. */
  readonly captureTargets: ReadonlyMap<UnitId, TileIndex>;
  /** Capturable properties that no unit is heading for. */
  readonly unclaimed: number;
  /** Units able to capture, including ones that are repairing. */
  readonly capturers: number;
}

/** Funds-equivalent worth of owning the property on `tile`. */
export function propertyValue(board: Board, tile: TileIndex): number {
  const { ruleset, state, profile } = board;
  const terrain = ruleset.terrain[state.terrain[tile]!]!;
  let days = profile.captureIncomeDays;
  if (terrain.builds.length > 0) days += profile.productionBonusDays;
  if (terrain.isHq) days += profile.hqBonusDays;
  const owner = state.owner[tile]!;
  if (owner !== NO_OWNER && owner !== board.me) days *= profile.enemyPropertyFactor;
  return days * board.income;
}

/**
 * True if the unit should head back to an owned property for repair or supply,
 * including an aircraft or ship whose fuel will soon only just get it home.
 */
export function needsRepair(board: Board, unit: Unit): boolean {
  const { ruleset, profile } = board;
  const def = ruleset.units[unit.type]!;
  return (
    hpPips(ruleset, unit.hp) <= profile.retreatPips ||
    unit.fuel <= def.maxFuel * profile.lowFuel ||
    (def.maxAmmo > 0 && unit.ammo === 0) ||
    runningDry(board, unit)
  );
}

/** True if `unit` is partway through capturing the property it stands on. */
export function isCapturing(board: Board, unit: Unit): boolean {
  const { ruleset, state } = board;
  return (
    ruleset.terrain[state.terrain[unit.pos]!]!.isProperty &&
    state.owner[unit.pos] !== unit.owner &&
    state.capture[unit.pos]! < ruleset.rules.capturePoints
  );
}

interface Pairing {
  readonly unit: UnitId;
  readonly tile: TileIndex;
  /** Turns of walking, less the property's priority. Lower pairs first. */
  readonly key: number;
}

/**
 * Sends each capturing unit to a different property. Pairs are taken cheapest
 * first, where cost is turns of walking less a priority for HQs, bases and enemy
 * property, so the nearest unit takes each property and none double up. A unit
 * already capturing keeps its property.
 */
export function makePlan(board: Board): Plan {
  const { ruleset, state, profile, me } = board;
  const tileCount = state.width * state.height;

  const targets: TileIndex[] = [];
  for (let tile = 0; tile < tileCount; tile++) {
    const terrain = ruleset.terrain[state.terrain[tile]!]!;
    if (!terrain.isProperty || state.owner[tile] === me) continue;
    const occupant = state.occupant[tile]!;
    // A property an enemy stands on cannot be captured until it moves.
    if (occupant !== NO_UNIT && state.units[occupant]!.owner !== me) continue;
    targets.push(tile);
  }

  const capturers = board.mine.filter((unit) => ruleset.units[unit.type]!.canCapture);
  const pairs: Pairing[] = [];
  for (const unit of capturers) {
    const capturing = isCapturing(board, unit);
    if (!capturing && needsRepair(board, unit)) continue;
    const def = ruleset.units[unit.type]!;
    const costs = costsFrom(ruleset, state, def.moveType, [unit.pos]);
    const pace = Math.max(1, def.movePoints);
    for (const tile of targets) {
      const cost = costs[tile]!;
      if (cost >= FAR) continue;
      if (capturing && tile === unit.pos) {
        pairs.push({ unit: unit.id, tile, key: -FAR });
        continue;
      }
      const terrain = ruleset.terrain[state.terrain[tile]!]!;
      let priority = 0;
      if (terrain.isHq) priority += profile.hqPriority;
      if (terrain.builds.length > 0) priority += profile.basePriority;
      if (state.owner[tile] !== NO_OWNER) priority += profile.enemyPropertyPriority;
      pairs.push({ unit: unit.id, tile, key: cost / pace - priority });
    }
  }
  pairs.sort((a, b) => a.key - b.key || a.unit - b.unit || a.tile - b.tile);

  const captureTargets = new Map<UnitId, TileIndex>();
  const claimed = new Set<TileIndex>();
  for (const pair of pairs) {
    if (captureTargets.has(pair.unit) || claimed.has(pair.tile)) continue;
    captureTargets.set(pair.unit, pair.tile);
    claimed.add(pair.tile);
  }
  return {
    captureTargets,
    unclaimed: targets.length - claimed.size,
    capturers: capturers.length,
  };
}
