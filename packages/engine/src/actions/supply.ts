import { patchUnit, relocateUnit, supplyAdjacent, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import type { Action, TileIndex } from '../types';
import { beginUnitAction, type ActionError } from './common';

export function applySupply(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Supply' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  if (!ruleset.units[ctx.unit.type]!.canSupply) return 'Unit cannot supply';

  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  const targets: TileIndex[] = [];
  if (supplyAdjacent(ruleset, draft, ctx.destination, ctx.unit.owner, targets) === 0) {
    return 'No adjacent unit to supply';
  }
  patchUnit(draft, action.unit, { moved: true });
  draft.events.push({ type: 'Supplied', by: action.unit, targets });
  return null;
}
