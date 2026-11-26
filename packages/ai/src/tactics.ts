import {
  attackTargetsFrom,
  canCaptureAt,
  canCounter,
  damageBetween,
  captureAmount,
  isIndirect,
  manhattan,
  NO_DAMAGE,
  NO_OWNER,
  NO_TILE,
  NO_UNIT,
  neighbours,
  type CompiledRuleset,
  type GameState,
  type TileIndex,
  type Unit,
  type UnitId,
} from '@tactics/engine';
import { dangerAt, expectedDamage, reachOf, standTiles, unitValue, type Board } from './board';
import { isCapturing, propertyValue } from './plan';

/** A unit action worth taking this turn, before its path is worked out. */
export interface Tactic {
  readonly kind: 'Attack' | 'Capture' | 'Supply';
  readonly unit: UnitId;
  readonly destination: TileIndex;
  /** Tile attacked, or `NO_TILE`. */
  readonly target: TileIndex;
  /** Expected gain in funds. Only positive tactics are offered. */
  readonly score: number;
}

export interface AttackForecast {
  /** Expected damage dealt, in internal HP. */
  readonly dealt: number;
  /** Chance, 0..1, that the defender is destroyed. */
  readonly killChance: number;
  /** Expected counterattack damage taken, in internal HP. */
  readonly counter: number;
}

/**
 * Expected result of `attacker` firing from `from` at the unit on `target`,
 * averaged over every luck roll. Null if it cannot hit that unit.
 */
export function forecastAttack(
  ruleset: CompiledRuleset,
  state: GameState,
  attacker: Unit,
  from: TileIndex,
  target: TileIndex,
): AttackForecast | null {
  const defenderId = state.occupant[target]!;
  if (defenderId === NO_UNIT) return null;
  const defender = state.units[defenderId]!;
  const countered = canCounter(ruleset, defender, attacker, manhattan(from, target, state.width));
  const rolls = ruleset.rules.luckMax + 1;
  let dealt = 0;
  let kills = 0;
  let counter = 0;

  for (let luck = 0; luck < rolls; luck++) {
    const damage = damageBetween(
      ruleset,
      state,
      attacker,
      attacker.hp,
      defender,
      defender.hp,
      target,
      luck,
    );
    if (damage === NO_DAMAGE) return null;
    if (damage >= defender.hp) {
      dealt += defender.hp;
      kills++;
      continue;
    }
    dealt += damage;
    if (countered) {
      counter += expectedDamage(
        ruleset,
        state,
        defender,
        defender.hp - damage,
        attacker,
        attacker.hp,
        from,
      );
    }
  }
  return { dealt: dealt / rolls, killChance: kills / rolls, counter: counter / rolls };
}

/**
 * Worth of stopping `enemy` capturing the property it stands on. Losing our HQ
 * next turn costs the game, so preventing that is worth as much as winning.
 */
function captureStake(board: Board, enemy: Unit): number {
  const { ruleset, state, me } = board;
  const tile = enemy.pos;
  const terrain = ruleset.terrain[state.terrain[tile]!]!;
  if (!terrain.isProperty || state.owner[tile] === enemy.owner) return 0;
  const remaining = state.capture[tile]!;
  if (remaining >= ruleset.rules.capturePoints) return 0;
  if (
    terrain.isHq &&
    state.owner[tile] === me &&
    remaining <= captureAmount(ruleset, state, enemy)
  ) {
    return board.profile.winValue;
  }
  return propertyValue(board, tile) * board.profile.captureBreak;
}

function attackScore(board: Board, unit: Unit, from: TileIndex, target: TileIndex): number | null {
  const { ruleset, state, profile } = board;
  const forecast = forecastAttack(ruleset, state, unit, from, target);
  if (forecast === null) return null;
  const defender = state.units[state.occupant[target]!]!;
  const maxHp = ruleset.rules.maxHp;
  const defenderWorth = unitValue(ruleset, state, defender);
  const attackerWorth = unitValue(ruleset, state, unit);

  // A capture is undone by a kill and slowed by lost HP.
  const slowed = (1 - forecast.killChance) * (forecast.dealt / defender.hp) * 0.5;
  const exposure = dangerAt(
    board,
    unit,
    from,
    unit.hp - forecast.counter,
    forecast.killChance === 1 ? defender.id : NO_UNIT,
  );
  return (
    (forecast.dealt / maxHp) * defenderWorth +
    forecast.killChance * profile.killBonus * defenderWorth +
    captureStake(board, defender) * (forecast.killChance + slowed) -
    (forecast.counter / maxHp) * attackerWorth -
    profile.attackExposure * board.caution * exposure
  );
}

function captureScore(board: Board, unit: Unit, tile: TileIndex): number {
  const { ruleset, state, profile } = board;
  const remaining = state.capture[tile]!;
  const amount = captureAmount(ruleset, state, unit);
  const terrain = ruleset.terrain[state.terrain[tile]!]!;
  if (remaining <= amount) {
    // A finished capture is banked even if the unit is lost afterwards.
    const enemyHq = terrain.isHq && state.owner[tile] !== NO_OWNER;
    return enemyHq ? profile.winValue : propertyValue(board, tile);
  }
  const progress = propertyValue(board, tile) * profile.captureProgress * (amount / remaining);
  return progress - profile.captureExposure * board.caution * dangerAt(board, unit, tile, unit.hp);
}

const adjacent = new Int32Array(4);

function supplyScore(board: Board, unit: Unit, tile: TileIndex): number {
  const { ruleset, state, profile } = board;
  const count = neighbours(tile, state.width, state.height, adjacent);
  let score = 0;
  for (let i = 0; i < count; i++) {
    const id = state.occupant[adjacent[i]!]!;
    if (id === NO_UNIT || id === unit.id) continue;
    const friend = state.units[id]!;
    if (friend.owner !== unit.owner) continue;
    const def = ruleset.units[friend.type]!;
    const fuel = friend.fuel / def.maxFuel;
    const ammo = def.maxAmmo > 0 ? friend.ammo / def.maxAmmo : 1;
    if (fuel >= profile.supplyNeed && ammo >= profile.supplyNeed) continue;
    score += (2 - fuel - ammo) * unitValue(ruleset, state, friend) * profile.supplyValue;
  }
  if (score === 0) return 0;
  return score - profile.danger.support * board.caution * dangerAt(board, unit, tile, unit.hp);
}

/**
 * Every attack, capture and supply the AI's unmoved units could make this turn
 * with a positive expected gain, best first. Ties keep unit and tile order, so
 * the same position always gives the same list.
 */
export function findTactics(board: Board): Tactic[] {
  const { ruleset, state } = board;
  const tactics: Tactic[] = [];

  for (const unit of board.mine) {
    if (unit.moved) continue;
    const def = ruleset.units[unit.type]!;
    const armed = def.maxRange > 0;
    if (!armed && !def.canCapture && !def.canSupply) continue;

    // A unit partway through a capture finishes it or nothing: moving resets it.
    const tiles = isCapturing(board, unit)
      ? [unit.pos]
      : standTiles(board, unit, reachOf(board, unit));
    const indirect = isIndirect(ruleset, unit.type);

    for (const tile of tiles) {
      if (armed && (!indirect || tile === unit.pos)) {
        for (const target of attackTargetsFrom(ruleset, state, unit, tile, tile !== unit.pos)) {
          const score = attackScore(board, unit, tile, target);
          if (score !== null && score > 0) {
            tactics.push({ kind: 'Attack', unit: unit.id, destination: tile, target, score });
          }
        }
      }
      if (def.canCapture && canCaptureAt(ruleset, state, unit, tile)) {
        const score = captureScore(board, unit, tile);
        if (score > 0) {
          tactics.push({
            kind: 'Capture',
            unit: unit.id,
            destination: tile,
            target: NO_TILE,
            score,
          });
        }
      }
      if (def.canSupply) {
        const score = supplyScore(board, unit, tile);
        if (score > 0) {
          tactics.push({
            kind: 'Supply',
            unit: unit.id,
            destination: tile,
            target: NO_TILE,
            score,
          });
        }
      }
    }
  }
  return tactics.sort((a, b) => b.score - a.score);
}
