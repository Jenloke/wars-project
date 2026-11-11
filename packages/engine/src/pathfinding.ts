import { IMPASSABLE, type CompiledRuleset } from './ruleset';
import { NO_TILE, NO_UNIT, type GameState, type TileIndex, type UnitId } from './types';
import { moveBudget } from './units';

export const UNREACHABLE = -1;

/**
 * Result of a reachability query. Buffers are owned by the caller and reused
 * between queries, so a query allocates nothing.
 */
export interface MoveField {
  /** Per tile: cheapest cost to reach it, or `UNREACHABLE`. */
  readonly cost: Int16Array;
  /** Per tile: previous tile on the cheapest path, or `NO_TILE`. */
  readonly cameFrom: Int32Array;
  origin: TileIndex;
  budget: number;
}

export function createMoveField(tileCount: number): MoveField {
  return {
    cost: new Int16Array(tileCount),
    cameFrom: new Int32Array(tileCount),
    origin: NO_TILE,
    budget: 0,
  };
}

/** Dial's algorithm buckets, one per cost value. Module-level to avoid reallocating. */
const buckets: number[][] = [];

/**
 * Computes every tile `unitId` can reach this turn into `field`.
 *
 * Dijkstra with a bucket queue: edge costs are small integers bounded by the move
 * budget, so each tile is settled in O(1) without a heap. Enemy units block;
 * friendly units can be passed through. Whether the unit may *stop* on a reached
 * tile is a separate question answered by the action rules.
 */
export function computeMoveField(
  ruleset: CompiledRuleset,
  state: GameState,
  unitId: UnitId,
  field: MoveField,
): MoveField {
  const unit = state.units[unitId];
  if (unit === undefined || unit.pos === NO_TILE) {
    throw new Error(`Unit ${unitId} is not on the map`);
  }
  const { width, height, terrain, occupant, units } = state;
  const { cost, cameFrom } = field;
  if (cost.length !== width * height) throw new Error('MoveField size does not match the map');

  const budget = moveBudget(ruleset, state, unit);
  const costRow = ruleset.units[unit.type]!.moveType * ruleset.terrainCount;
  const moveCost = ruleset.moveCost;
  const owner = unit.owner;

  cost.fill(UNREACHABLE);
  cameFrom.fill(NO_TILE);
  field.origin = unit.pos;
  field.budget = budget;

  while (buckets.length <= budget) buckets.push([]);
  for (let c = 0; c <= budget; c++) buckets[c]!.length = 0;

  cost[unit.pos] = 0;
  buckets[0]!.push(unit.pos);

  for (let c = 0; c <= budget; c++) {
    const bucket = buckets[c]!;
    // The bucket can only grow with entries of a strictly higher cost, so a plain
    // index loop is safe.
    for (let b = 0; b < bucket.length; b++) {
      const tile = bucket[b]!;
      if (cost[tile] !== c) continue; // superseded by a cheaper route

      const x = tile % width;
      const y = (tile / width) | 0;
      for (let dir = 0; dir < 4; dir++) {
        let next: number;
        if (dir === 0) {
          if (y === 0) continue;
          next = tile - width;
        } else if (dir === 1) {
          if (x === width - 1) continue;
          next = tile + 1;
        } else if (dir === 2) {
          if (y === height - 1) continue;
          next = tile + width;
        } else {
          if (x === 0) continue;
          next = tile - 1;
        }

        const step = moveCost[costRow + terrain[next]!]!;
        if (step === IMPASSABLE) continue;
        const nextCost = c + step;
        if (nextCost > budget) continue;
        const known = cost[next]!;
        if (known !== UNREACHABLE && known <= nextCost) continue;
        const blocker = occupant[next]!;
        if (blocker !== NO_UNIT && units[blocker]!.owner !== owner) continue;

        cost[next] = nextCost;
        cameFrom[next] = tile;
        buckets[nextCost]!.push(next);
      }
    }
  }
  return field;
}

/**
 * Writes the cheapest path from the field origin to `destination` into `out`
 * (origin excluded, destination included) and returns it. Returns an empty path
 * if the destination is the origin or unreachable.
 */
export function pathTo(field: MoveField, destination: TileIndex, out: TileIndex[]): TileIndex[] {
  out.length = 0;
  if (field.cost[destination] === UNREACHABLE) return out;
  for (let tile = destination; tile !== field.origin; tile = field.cameFrom[tile]!) {
    out.push(tile);
  }
  out.reverse();
  return out;
}
