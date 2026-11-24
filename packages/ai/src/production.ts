import {
  getBuildOptions,
  isIndirect,
  manhattan,
  NO_DAMAGE,
  NO_UNIT,
  weaponBaseDamage,
  type Action,
  type TileIndex,
} from '@tactics/engine';
import { unitValue, type Board } from './board';
import type { Plan } from './plan';

/** One enemy unit (or, before any exist, one expected kind) to build against. */
interface Opponent {
  readonly type: number;
  readonly ammo: number;
  /** Funds value of the unit. */
  readonly worth: number;
  /** How much it counts toward the army's make-up. */
  readonly weight: number;
}

/**
 * The enemy army, weighted by remaining HP. Before the enemy has any units, every
 * armed type that can be built stands in for it, commoner the cheaper it is.
 */
function opposition(board: Board): Opponent[] {
  const { ruleset, state } = board;
  const maxHp = ruleset.rules.maxHp;
  if (board.enemies.length > 0) {
    return board.enemies.map((enemy) => ({
      type: enemy.type,
      ammo: enemy.ammo,
      worth: unitValue(ruleset, state, enemy),
      weight: enemy.hp / maxHp,
    }));
  }
  const buildable = new Set<number>();
  for (const terrain of ruleset.terrain)
    for (const unitType of terrain.builds) buildable.add(unitType);
  const expected: Opponent[] = [];
  for (const unitType of buildable) {
    const def = ruleset.units[unitType]!;
    if (def.maxRange === 0) continue;
    expected.push({
      type: unitType,
      ammo: def.maxAmmo,
      worth: def.cost,
      weight: 1 / Math.max(1, def.cost),
    });
  }
  return expected;
}

/** Base damage as a share of a full-HP unit, 0..1. */
function share(base: number): number {
  return base === NO_DAMAGE || base <= 0 ? 0 : Math.min(1, base / 100);
}

/**
 * Funds a unit of `unitType` is expected to take off the enemy army over its
 * life, less its price.
 *
 * An engagement is one attack, started by either side: the attacker hits first,
 * and the target fires back at its reduced strength only when both fight at close
 * range. Indirect units pick their fights, so they start more of them, and a unit
 * that cannot hurt an opponent never starts one. A unit lasts as many engagements
 * as it takes to lose its HP, so a strong, durable unit repays its price many
 * times, while one that trades badly is worth less than it costs.
 *
 * Null if it cannot hurt any opponent.
 */
function lifetimeValue(
  board: Board,
  unitType: number,
  cost: number,
  army: readonly Opponent[],
): number | null {
  const { ruleset, profile } = board;
  const def = ruleset.units[unitType]!;
  const indirect = isIndirect(ruleset, unitType);
  let dealtValue = 0;
  let lostShare = 0;
  let weights = 0;
  let canHurt = false;
  for (const opponent of army) {
    weights += opponent.weight;
    const dealt = share(weaponBaseDamage(ruleset, unitType, def.maxAmmo, opponent.type));
    const taken = share(weaponBaseDamage(ruleset, opponent.type, opponent.ammo, unitType));
    if (dealt === 0 && taken === 0) continue;
    if (dealt > 0) canHurt = true;

    const opponentIndirect = isIndirect(ruleset, opponent.type);
    const exchange = !indirect && !opponentIndirect;
    let initiative = 0.5;
    if (dealt === 0) initiative = 0;
    else if (taken === 0) initiative = 1;
    else if (indirect !== opponentIndirect) {
      initiative = indirect ? profile.indirectInitiative : 1 - profile.indirectInitiative;
    }
    const dealtWhenStriking = dealt;
    const dealtWhenStruck = exchange ? dealt * (1 - taken) : 0;
    const takenWhenStriking = exchange ? taken * (1 - dealt) : 0;
    const takenWhenStruck = taken;
    dealtValue +=
      opponent.weight *
      opponent.worth *
      (initiative * dealtWhenStriking + (1 - initiative) * dealtWhenStruck);
    lostShare +=
      opponent.weight * (initiative * takenWhenStriking + (1 - initiative) * takenWhenStruck);
  }
  if (!canHurt || weights === 0) return null;
  const attrition = Math.max(profile.minAttrition, lostShare / weights);
  return dealtValue / weights / attrition - cost;
}

/** Our bases that are free to build on, nearest the enemy first. */
function freeBases(board: Board): TileIndex[] {
  const { ruleset, state, me } = board;
  const fronts: TileIndex[] = board.enemies.map((enemy) => enemy.pos);
  const bases: TileIndex[] = [];
  for (let tile = 0; tile < state.owner.length; tile++) {
    const owner = state.owner[tile]!;
    if (owner !== me && owner >= 0) fronts.push(tile);
    if (owner !== me || state.occupant[tile] !== NO_UNIT) continue;
    if (ruleset.terrain[state.terrain[tile]!]!.builds.length > 0) bases.push(tile);
  }
  const nearest = (tile: TileIndex) => {
    let best = Infinity;
    for (const front of fronts) best = Math.min(best, manhattan(tile, front, state.width));
    return best;
  };
  return bases
    .map((tile) => ({ tile, distance: nearest(tile) }))
    .sort((a, b) => a.distance - b.distance || a.tile - b.tile)
    .map((entry) => entry.tile);
}

/**
 * The next unit to build, or null when no base is free or nothing useful is
 * affordable. Builds counter the enemy army's make-up, keep enough capturers while
 * properties are unclaimed, and spread funds so one expensive unit does not leave
 * other bases idle. Funds in the bank win nothing, so the best option is built even
 * when every option trades at a loss.
 */
export function findBuild(board: Board, plan: Plan): Action | null {
  const { ruleset, state, profile, me } = board;
  const funds = state.players[me]!.funds;
  const bases = freeBases(board);
  if (bases.length === 0) return null;

  const army = opposition(board);
  const needCapturers = plan.unclaimed > 0 && plan.capturers < profile.maxCapturers;
  const owned = new Map<number, number>();
  for (const unit of board.mine) owned.set(unit.type, (owned.get(unit.type) ?? 0) + 1);
  const armySize = Math.max(1, board.mine.length);

  for (const at of bases) {
    const options = getBuildOptions(ruleset, state, at).filter((option) => option.affordable);
    if (options.length === 0) continue;
    const cheapest = Math.min(...options.map((option) => option.cost));
    const evenSplit = (funds / bases.length) * profile.budgetShare;
    const budget = Math.max(cheapest, Math.min(funds, evenSplit));

    let best: { unitType: number; score: number } | null = null;
    for (const option of options) {
      if (option.cost > budget) continue;
      const def = ruleset.units[option.unitType]!;
      const lifetime = lifetimeValue(board, option.unitType, option.cost, army);
      if (lifetime === null && !(needCapturers && def.canCapture)) continue;
      const common = (owned.get(option.unitType) ?? 0) / armySize;
      let score = (lifetime ?? 0) - profile.diversity * common * option.cost;
      if (needCapturers && def.canCapture) score += profile.captureNeedDays * board.income;
      if (best === null || score > best.score) best = { unitType: option.unitType, score };
    }
    if (best !== null) return { type: 'Build', at, unitType: best.unitType };
  }
  return null;
}
