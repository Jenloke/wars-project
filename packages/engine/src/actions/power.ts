import { patchPlayer, patchUnit, resupplyUnit, unitIdsOf, type Draft } from '../draft';
import type { CompiledPowerEffect, CompiledRuleset } from '../ruleset';
import { powerBlocker } from '../rules';
import type { PlayerIndex } from '../types';
import { incomeOf } from '../units';
import type { ActionError } from './common';

function applyEffect(
  ruleset: CompiledRuleset,
  draft: Draft,
  player: PlayerIndex,
  effect: CompiledPowerEffect,
): void {
  switch (effect.kind) {
    case 'heal': {
      const maxHp = ruleset.rules.maxHp;
      for (const id of unitIdsOf(draft, player)) {
        const unit = draft.state.units[id]!;
        if (effect.units[unit.type] !== 1 || unit.hp >= maxHp) continue;
        patchUnit(draft, id, { hp: Math.min(maxHp, unit.hp + effect.hp) });
      }
      return;
    }
    case 'resupply':
      for (const id of unitIdsOf(draft, player)) {
        if (effect.units[draft.state.units[id]!.type] === 1) resupplyUnit(ruleset, draft, id);
      }
      return;
    case 'funds': {
      const paid = Math.floor(
        (incomeOf(ruleset, draft.state, player) * effect.incomePercent) / 100,
      );
      patchPlayer(draft, player, { funds: draft.state.players[player]!.funds + paid });
      return;
    }
    default: {
      const unknown: never = effect;
      throw new Error(`Unknown power effect ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * Spends the meter and turns the active player's power on. Its modifiers apply
 * from now until the start of their next turn; its effects happen at once, in
 * the order listed, with the power's modifiers already in effect.
 */
export function applyActivatePower(ruleset: CompiledRuleset, draft: Draft): ActionError {
  const player = draft.state.activePlayer;
  const blocker = powerBlocker(ruleset, draft.state, player);
  if (blocker !== null) return blocker;

  const side = draft.state.players[player]!;
  const power = ruleset.commanders[side.commander]!.power!;
  patchPlayer(draft, player, { power: side.power - power.cost, powerActive: true });
  draft.events.push({ type: 'PowerActivated', player });
  for (const effect of power.effects) applyEffect(ruleset, draft, player, effect);
  return null;
}
