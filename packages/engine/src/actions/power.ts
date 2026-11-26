import { patchPlayer, patchUnit, resupplyUnit, unitIdsOf, type Draft } from '../draft';
import type { CompiledPowerEffect, CompiledRuleset } from '../ruleset';
import { powerBlocker } from '../rules';
import type { PlayerIndex } from '../types';
import { incomeOf } from '../units';
import type { ActionError } from './common';

/**
 * Adds `points` to `player`'s power meter. Nothing charges while their power is
 * active, and the meter holds no more than the power costs. (A commander with
 * no power keeps counting, as every meter did before powers existed.)
 */
export function chargeMeter(
  ruleset: CompiledRuleset,
  draft: Draft,
  player: PlayerIndex,
  points: number,
): void {
  if (points <= 0) return;
  const side = draft.state.players[player]!;
  if (side.powerActive) return;
  const power = ruleset.commanders[side.commander]!.power;
  let meter = side.power + points;
  if (power !== null && meter > power.cost) meter = power.cost;
  if (meter !== side.power) patchPlayer(draft, player, { power: meter });
}

/** Meter points `player` earns from `percent` percent of `value`. */
export function chargeShare(value: number, percent: number): number {
  return Math.floor((value * percent) / 100);
}

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
