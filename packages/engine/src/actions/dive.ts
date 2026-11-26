import { patchUnit, relocateUnit, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { canDiveUnit } from '../rules';
import type { Action } from '../types';
import { beginUnitAction, type ActionError } from './common';

/** Moves, then dives: out of reach of most attackers, at a higher daily fuel cost. */
export function applyDive(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Dive' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  if (!canDiveUnit(ruleset, ctx.unit)) {
    return ctx.unit.dived ? 'Unit is already dived' : 'Unit cannot dive';
  }
  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  patchUnit(draft, action.unit, { dived: true, moved: true });
  draft.events.push({ type: 'Dived', unit: action.unit });
  return null;
}

/** Moves, then surfaces. */
export function applySurface(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Surface' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  if (!ctx.unit.dived) return 'Unit is not dived';
  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  patchUnit(draft, action.unit, { dived: false, moved: true });
  draft.events.push({ type: 'Surfaced', unit: action.unit });
  return null;
}
