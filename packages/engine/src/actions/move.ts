import { patchUnit, relocateUnit, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import type { Action } from '../types';
import { beginUnitAction, type ActionError } from './common';

export function applyMove(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Move' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  patchUnit(draft, action.unit, { moved: true });
  return null;
}
