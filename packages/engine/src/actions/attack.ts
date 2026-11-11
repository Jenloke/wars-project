import { canCounter, damageBetween, usesPrimaryWeapon } from '../combat';
import { destroyUnit, patchPlayer, patchUnit, relocateUnit, type Draft } from '../draft';
import { manhattan } from '../grid';
import { NO_DAMAGE, type CompiledRuleset } from '../ruleset';
import { rngAdvance, rngInt } from '../rng';
import { NO_UNIT, type Action, type TileIndex, type Unit } from '../types';
import { isIndirect, unitCost } from '../units';
import { beginUnitAction, type ActionError } from './common';

function rollLuck(ruleset: CompiledRuleset, draft: Draft): number {
  const seed = rngAdvance(draft.state.rng);
  draft.state.rng = seed;
  return rngInt(seed, ruleset.rules.luckMax + 1);
}

/** Charges both power meters from the funds value of the damage dealt. */
function chargePower(
  ruleset: CompiledRuleset,
  draft: Draft,
  attacker: Unit,
  defender: Unit,
  damage: number,
): void {
  const state = draft.state;
  const value = Math.floor(
    (unitCost(ruleset, state, defender.owner, defender.type) * damage) / ruleset.rules.maxHp,
  );
  if (value === 0) return;
  const defenderSide = state.players[defender.owner]!;
  const defenderGain = ruleset.commanders[defenderSide.commander]!.powerGain;
  patchPlayer(draft, defender.owner, {
    power: defenderSide.power + Math.floor((value * defenderGain) / 100),
  });
  const attackerSide = state.players[attacker.owner]!;
  const attackerGain = ruleset.commanders[attackerSide.commander]!.powerGain;
  patchPlayer(draft, attacker.owner, {
    power: attackerSide.power + Math.floor((value * attackerGain) / 200),
  });
}

/**
 * One exchange of fire: `attacker` hits `defender`. Returns the defender's
 * remaining HP (0 if destroyed).
 */
function strike(
  ruleset: CompiledRuleset,
  draft: Draft,
  attacker: Unit,
  attackerTile: TileIndex,
  defender: Unit,
  defenderTile: TileIndex,
  isCounter: boolean,
): number {
  const luck = rollLuck(ruleset, draft);
  const raw = damageBetween(
    ruleset,
    draft.state,
    attacker,
    attacker.hp,
    defender,
    defender.hp,
    defenderTile,
    luck,
  );
  const damage = raw > defender.hp ? defender.hp : raw;

  if (usesPrimaryWeapon(ruleset, attacker.type, attacker.ammo, defender.type)) {
    patchUnit(draft, attacker.id, { ammo: attacker.ammo - 1 });
  }
  draft.events.push({
    type: 'Attacked',
    attacker: attacker.id,
    defender: defender.id,
    from: attackerTile,
    target: defenderTile,
    damage,
    isCounter,
  });
  chargePower(ruleset, draft, attacker, defender, damage);

  const remaining = defender.hp - damage;
  if (remaining <= 0) {
    destroyUnit(ruleset, draft, defender.id);
    return 0;
  }
  patchUnit(draft, defender.id, { hp: remaining });
  return remaining;
}

export function applyAttack(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Attack' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  const state = draft.state;
  const def = ruleset.units[ctx.unit.type]!;

  if (def.maxRange === 0) return 'Unit is unarmed';
  if (isIndirect(ruleset, ctx.unit.type) && action.path.length > 0) {
    return 'Indirect units cannot move and attack in the same turn';
  }
  const target = action.target;
  if (!Number.isInteger(target) || target < 0 || target >= state.width * state.height) {
    return 'Target is off the map';
  }
  const defenderId = state.occupant[target]!;
  if (defenderId === NO_UNIT) return 'No unit at the target';
  const defender = state.units[defenderId]!;
  if (defender.owner === ctx.unit.owner) return 'Cannot attack your own unit';

  const distance = manhattan(ctx.destination, target, state.width);
  if (distance < def.minRange || distance > def.maxRange) return 'Target is out of range';
  if (
    damageBetween(ruleset, state, ctx.unit, ctx.unit.hp, defender, defender.hp, target, 0) ===
    NO_DAMAGE
  ) {
    return 'Unit has no weapon that can hit the target';
  }

  const attacker = relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  const defenderHp = strike(ruleset, draft, attacker, ctx.destination, defender, target, false);

  if (defenderHp > 0) {
    // Re-read both units: the first strike changed the defender's HP and may
    // have spent the attacker's ammo.
    const woundedDefender = draft.state.units[defenderId]!;
    const currentAttacker = draft.state.units[action.unit]!;
    if (canCounter(ruleset, woundedDefender, currentAttacker, distance)) {
      strike(ruleset, draft, woundedDefender, target, currentAttacker, ctx.destination, true);
    }
  }

  if (draft.state.units[action.unit] !== undefined) {
    patchUnit(draft, action.unit, { moved: true });
  }
  return null;
}
