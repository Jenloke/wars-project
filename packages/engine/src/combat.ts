import { manhattan } from './grid';
import { NO_DAMAGE, type CompiledRuleset } from './ruleset';
import { NO_UNIT, type GameState, type TileIndex, type Unit, type UnitId } from './types';
import { hpPips, maxPips } from './units';

/** True if the attacker would fire its ammo-using primary weapon at this defender. */
export function usesPrimaryWeapon(
  ruleset: CompiledRuleset,
  attackerType: number,
  attackerAmmo: number,
  defenderType: number,
): boolean {
  return (
    attackerAmmo > 0 &&
    ruleset.primaryDamage[attackerType * ruleset.unitCount + defenderType] !== NO_DAMAGE
  );
}

/**
 * Base damage percent for a matchup, or `NO_DAMAGE` if the attacker has no weapon
 * that can hit the defender. The primary weapon is preferred while it has ammo.
 */
export function weaponBaseDamage(
  ruleset: CompiledRuleset,
  attackerType: number,
  attackerAmmo: number,
  defenderType: number,
): number {
  const cell = attackerType * ruleset.unitCount + defenderType;
  if (attackerAmmo > 0) {
    const primary = ruleset.primaryDamage[cell]!;
    if (primary !== NO_DAMAGE) return primary;
  }
  return ruleset.secondaryDamage[cell]!;
}

/**
 * The damage formula, in internal HP.
 *
 *   percent = (base * attack% / 100 + luck)
 *           * attackerPips / maxPips
 *           * (200 - defence% - stars * defenderPips) / 100
 *
 * Integer arithmetic throughout so results are identical on every platform.
 */
export function computeDamage(
  ruleset: CompiledRuleset,
  base: number,
  attackPercent: number,
  attackerHp: number,
  defencePercent: number,
  defenderHp: number,
  defenceStars: number,
  luck: number,
): number {
  const rules = ruleset.rules;
  const attackerPips = hpPips(ruleset, attackerHp);
  const defenderPips = hpPips(ruleset, defenderHp);
  const defenceFactor = 200 - defencePercent - defenceStars * defenderPips;
  if (defenceFactor <= 0) return 0;
  const percent = Math.floor(
    ((base * attackPercent + luck * 100) * attackerPips * defenceFactor) /
      (100 * 100 * maxPips(ruleset)),
  );
  return percent <= 0 ? 0 : Math.floor((percent * rules.maxHp) / 100);
}

/**
 * Damage `attacker` (with `attackerHp`) deals to `defender` standing on
 * `defenderTile`, or `NO_DAMAGE` if it has no usable weapon.
 */
export function damageBetween(
  ruleset: CompiledRuleset,
  state: GameState,
  attacker: Unit,
  attackerHp: number,
  defender: Unit,
  defenderHp: number,
  defenderTile: TileIndex,
  luck: number,
): number {
  const base = weaponBaseDamage(ruleset, attacker.type, attacker.ammo, defender.type);
  if (base === NO_DAMAGE) return NO_DAMAGE;
  const attackPercent =
    ruleset.commanders[state.players[attacker.owner]!.commander]!.attack[attacker.type]!;
  const defencePercent =
    ruleset.commanders[state.players[defender.owner]!.commander]!.defence[defender.type]!;
  const stars = ruleset.terrain[state.terrain[defenderTile]!]!.defence;
  return computeDamage(
    ruleset,
    base,
    attackPercent,
    attackerHp,
    defencePercent,
    defenderHp,
    stars,
    luck,
  );
}

/** True if `defender` can return fire at an attacker `distance` tiles away. */
export function canCounter(
  ruleset: CompiledRuleset,
  defender: Unit,
  attacker: Unit,
  distance: number,
): boolean {
  if (distance !== 1) return false;
  const def = ruleset.units[defender.type]!;
  if (def.minRange !== 1) return false;
  return weaponBaseDamage(ruleset, defender.type, defender.ammo, attacker.type) !== NO_DAMAGE;
}

export interface AttackPreview {
  /** Damage range dealt to the defender, in internal HP. */
  readonly min: number;
  readonly max: number;
  /** Counterattack damage range taken by the attacker. Both 0 if no counter. */
  readonly counterMin: number;
  readonly counterMax: number;
}

/**
 * Damage forecast for an attack from `fromTile`, without consuming randomness.
 * Returns null if the attack is impossible.
 */
export function previewAttack(
  ruleset: CompiledRuleset,
  state: GameState,
  attackerId: UnitId,
  fromTile: TileIndex,
  targetTile: TileIndex,
): AttackPreview | null {
  const attacker = state.units[attackerId];
  const defenderId = state.occupant[targetTile];
  if (attacker === undefined || defenderId === undefined || defenderId === NO_UNIT) return null;
  const defender = state.units[defenderId]!;
  const luckMax = ruleset.rules.luckMax;

  const min = damageBetween(
    ruleset,
    state,
    attacker,
    attacker.hp,
    defender,
    defender.hp,
    targetTile,
    0,
  );
  if (min === NO_DAMAGE) return null;
  const max = damageBetween(
    ruleset,
    state,
    attacker,
    attacker.hp,
    defender,
    defender.hp,
    targetTile,
    luckMax,
  );

  let counterMin = 0;
  let counterMax = 0;
  if (canCounter(ruleset, defender, attacker, manhattan(fromTile, targetTile, state.width))) {
    // The counter is weakest after our best hit and strongest after our worst.
    const hpAfterBest = defender.hp - max;
    const hpAfterWorst = defender.hp - min;
    if (hpAfterBest > 0) {
      counterMin = damageBetween(
        ruleset,
        state,
        defender,
        hpAfterBest,
        attacker,
        attacker.hp,
        fromTile,
        0,
      );
    }
    if (hpAfterWorst > 0) {
      counterMax = damageBetween(
        ruleset,
        state,
        defender,
        hpAfterWorst,
        attacker,
        attacker.hp,
        fromTile,
        luckMax,
      );
    }
  }
  return { min, max, counterMin, counterMax };
}
