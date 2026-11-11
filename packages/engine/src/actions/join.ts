import { patchPlayer, patchUnit, relocateUnit, removeUnit, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { canJoinUnits } from '../rules';
import type { Action } from '../types';
import { hpPips, maxPips, unitCost } from '../units';
import { beginUnitAction, type ActionError } from './common';

/**
 * Merges the moving unit into a damaged unit of the same type. HP, fuel and ammo
 * are summed and capped; HP pips above the cap are refunded at build cost.
 */
export function applyJoin(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Join' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'friendly');
  if (typeof ctx === 'string') return ctx;
  const state = draft.state;
  const target = state.units[state.occupant[ctx.destination]!]!;
  if (!canJoinUnits(ruleset, ctx.unit, target)) return 'Units cannot join';

  const mover = relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, false);
  const def = ruleset.units[target.type]!;
  const rules = ruleset.rules;
  const pipCap = maxPips(ruleset);

  const excessPips = hpPips(ruleset, mover.hp) + hpPips(ruleset, target.hp) - pipCap;
  if (excessPips > 0) {
    const refund = Math.floor(
      (unitCost(ruleset, state, target.owner, target.type) * excessPips) / pipCap,
    );
    patchPlayer(draft, target.owner, { funds: state.players[target.owner]!.funds + refund });
  }

  patchUnit(draft, target.id, {
    hp: Math.min(rules.maxHp, mover.hp + target.hp),
    fuel: Math.min(def.maxFuel, mover.fuel + target.fuel),
    ammo: Math.min(def.maxAmmo, mover.ammo + target.ammo),
    moved: true,
  });
  // The mover no longer occupies a tile, so removing it leaves the grid untouched.
  removeUnit(ruleset, draft, mover.id);
  draft.events.push({ type: 'Joined', unit: mover.id, into: target.id });
  return null;
}
