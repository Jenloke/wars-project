import {
  isIndirect,
  NO_DAMAGE,
  NO_UNIT,
  neighbours,
  pathTo,
  unitCost,
  weaponBaseDamage,
  type Action,
  type TileIndex,
  type Unit,
} from '@tactics/engine';
import { dangerAt, reachOf, standTiles, unitValue, type Board } from './board';
import { costsTo, FAR, tilesInRange } from './distance';
import { needsRepair, type Plan } from './plan';
import type { Role } from './profile';

/** Where a unit is heading when it has nothing to attack or capture. */
export interface Orders {
  readonly role: Role;
  /** Per tile: movement cost from there to the goal, or `FAR`. */
  readonly goal: Int32Array;
}

/** Goal fields shared by units of one kind within a single decision. */
export type GoalCache = Map<string, Int32Array | null>;

function cached(cache: GoalCache, key: string, build: () => Int32Array | null): Int32Array | null {
  let field = cache.get(key);
  if (field === undefined) {
    field = build();
    cache.set(key, field);
  }
  return field;
}

/** True if `field` gives the unit standing on `from` somewhere to go. */
function leadsSomewhere(field: Int32Array | null, from: TileIndex): field is Int32Array {
  return field !== null && field[from]! < FAR;
}

/**
 * Tiles from which a unit of `unitType` could fire on an enemy: next to it for
 * direct fire, in the range band for indirect. Enemies it barely scratches are
 * only chased when there is nothing better.
 */
function fightGoal(board: Board, unitType: number, cache: GoalCache): Int32Array | null {
  return cached(cache, `fight:${unitType}`, () => {
    const { ruleset, state, profile } = board;
    const def = ruleset.units[unitType]!;
    const strong: TileIndex[] = [];
    const weak: TileIndex[] = [];
    const band: TileIndex[] = [];
    for (const enemy of board.enemies) {
      const base = weaponBaseDamage(ruleset, unitType, def.maxAmmo, enemy.type);
      if (base === NO_DAMAGE || base <= 0) continue;
      const into = base >= profile.minTargetDamage ? strong : weak;
      into.push(
        ...tilesInRange(enemy.pos, def.minRange, def.maxRange, state.width, state.height, band),
      );
    }
    const goals = strong.length > 0 ? strong : weak;
    return goals.length > 0 ? costsTo(ruleset, state, def.moveType, goals) : null;
  });
}

const adjacent = new Int32Array(4);

/** Tiles next to friendly units, preferring those that need fuel or ammo. */
function supportGoal(board: Board, moveType: number, cache: GoalCache): Int32Array | null {
  return cached(cache, `support:${moveType}`, () => {
    const { ruleset, state, profile } = board;
    const needy: TileIndex[] = [];
    const escorts: TileIndex[] = [];
    for (const friend of board.mine) {
      const def = ruleset.units[friend.type]!;
      if (def.canSupply) continue;
      const low =
        friend.fuel < def.maxFuel * profile.supplyNeed ||
        (def.maxAmmo > 0 && friend.ammo < def.maxAmmo * profile.supplyNeed);
      if (!low && def.maxRange === 0) continue;
      const into = low ? needy : escorts;
      const count = neighbours(friend.pos, state.width, state.height, adjacent);
      for (let i = 0; i < count; i++) into.push(adjacent[i]!);
    }
    const goals = needy.length > 0 ? needy : escorts;
    return goals.length > 0 ? costsTo(ruleset, state, moveType, goals) : null;
  });
}

/** Enemy-owned properties, for units with nothing else to do. */
function marchGoal(board: Board, moveType: number, cache: GoalCache): Int32Array | null {
  return cached(cache, `march:${moveType}`, () => {
    const { state, me } = board;
    const goals: TileIndex[] = [];
    for (let tile = 0; tile < state.owner.length; tile++) {
      const owner = state.owner[tile]!;
      if (owner !== me && owner >= 0 && state.players[owner]!.alive) goals.push(tile);
    }
    return goals.length > 0 ? costsTo(board.ruleset, state, moveType, goals) : null;
  });
}

/** Owned properties that would repair `unit` and that it can stand on. */
function retreatGoal(board: Board, unit: Unit): Int32Array | null {
  const { ruleset, state, me } = board;
  const moveType = ruleset.units[unit.type]!.moveType;
  const goals: TileIndex[] = [];
  for (let tile = 0; tile < state.owner.length; tile++) {
    if (state.owner[tile] !== me) continue;
    if (ruleset.terrain[state.terrain[tile]!]!.repairs[moveType] !== 1) continue;
    const occupant = state.occupant[tile]!;
    if (occupant === NO_UNIT || occupant === unit.id) goals.push(tile);
  }
  return goals.length > 0 ? costsTo(ruleset, state, moveType, goals) : null;
}

/**
 * Picks a unit's role, in order: repair when worn down, walk to its assigned
 * property, close in on enemies, escort friends (supply units), march on enemy
 * property, and finally step off a base it is blocking. Null if it has nowhere
 * useful to go.
 */
export function ordersFor(board: Board, plan: Plan, unit: Unit, cache: GoalCache): Orders | null {
  const { ruleset, state } = board;
  const def = ruleset.units[unit.type]!;

  if (needsRepair(board, unit)) {
    const goal = retreatGoal(board, unit);
    if (leadsSomewhere(goal, unit.pos)) return { role: 'retreat', goal };
  }
  const target = plan.captureTargets.get(unit.id);
  if (target !== undefined) {
    const goal = costsTo(ruleset, state, def.moveType, [target]);
    if (leadsSomewhere(goal, unit.pos)) return { role: 'capture', goal };
  }
  if (def.maxRange > 0) {
    const goal = fightGoal(board, unit.type, cache);
    if (leadsSomewhere(goal, unit.pos)) {
      return { role: isIndirect(ruleset, unit.type) ? 'artillery' : 'fight', goal };
    }
  }
  if (def.canSupply) {
    const goal = supportGoal(board, def.moveType, cache);
    if (leadsSomewhere(goal, unit.pos)) return { role: 'support', goal };
  }
  const goal = marchGoal(board, def.moveType, cache);
  if (leadsSomewhere(goal, unit.pos)) return { role: 'march', goal };
  // Nowhere to go, but a unit left on a base stops it building.
  const terrain = ruleset.terrain[state.terrain[unit.pos]!]!;
  if (state.owner[unit.pos] === board.me && terrain.builds.length > 0) {
    return { role: 'hold', goal: new Int32Array(state.width * state.height) };
  }
  return null;
}

/** Facts about the position that every move is judged against. */
interface MoveContext {
  /** True if the AI could afford to build this turn, so bases should be left clear. */
  readonly canBuild: boolean;
}

function tileScore(
  board: Board,
  unit: Unit,
  orders: Orders,
  tile: TileIndex,
  context: MoveContext,
): number {
  const { ruleset, state, profile } = board;
  const def = ruleset.units[unit.type]!;
  const terrain = ruleset.terrain[state.terrain[tile]!]!;
  const worth = unitValue(ruleset, state, unit);

  let score =
    -(orders.goal[tile]! / Math.max(1, def.movePoints)) * profile.progress[orders.role] * worth;
  score -= profile.danger[orders.role] * board.caution * dangerAt(board, unit, tile, unit.hp);
  score += profile.terrainStar * terrain.defence * worth;
  if (state.owner[tile] === board.me) {
    if (context.canBuild && terrain.builds.length > 0)
      score -= profile.blockBaseDays * board.income;
    // Standing on our HQ is the surest way to stop an enemy capturing it.
    if (terrain.isHq && board.captureReach[tile] === 1) score += profile.guardHqDays * board.income;
  }
  return score;
}

/** The tile `unit` should move to, or null if staying put is as good. */
export function bestMove(
  board: Board,
  unit: Unit,
  orders: Orders,
  context: MoveContext,
): TileIndex | null {
  const field = reachOf(board, unit);
  const stay = tileScore(board, unit, orders, unit.pos, context);
  let best = unit.pos;
  let bestScore = stay;
  for (const tile of standTiles(board, unit, field)) {
    if (tile === unit.pos) continue;
    const score = tileScore(board, unit, orders, tile, context);
    if (score > bestScore) {
      best = tile;
      bestScore = score;
    }
  }
  return best !== unit.pos && bestScore - stay >= board.profile.minMoveGain ? best : null;
}

/**
 * The next repositioning move, or null when every unit is where it wants to be.
 * Units nearest their goals move first, clearing the way for those behind.
 */
export function findMove(
  board: Board,
  plan: Plan,
  isLegal: (action: Action) => boolean,
): Action | null {
  const { ruleset, state } = board;
  const cache: GoalCache = new Map();
  const funds = state.players[board.me]!.funds;
  let cheapest = Infinity;
  for (const terrain of ruleset.terrain) {
    for (const unitType of terrain.builds) {
      cheapest = Math.min(cheapest, unitCost(ruleset, state, board.me, unitType));
    }
  }
  const context: MoveContext = { canBuild: funds >= cheapest };

  const movers: { unit: Unit; orders: Orders }[] = [];
  for (const unit of board.mine) {
    if (unit.moved) continue;
    const orders = ordersFor(board, plan, unit, cache);
    if (orders !== null) movers.push({ unit, orders });
  }
  movers.sort(
    (a, b) => a.orders.goal[a.unit.pos]! - b.orders.goal[b.unit.pos]! || a.unit.id - b.unit.id,
  );

  for (const { unit, orders } of movers) {
    const tile = bestMove(board, unit, orders, context);
    if (tile === null) continue;
    const action: Action = {
      type: 'Move',
      unit: unit.id,
      path: pathTo(reachOf(board, unit), tile, []),
    };
    if (isLegal(action)) return action;
  }
  return null;
}
