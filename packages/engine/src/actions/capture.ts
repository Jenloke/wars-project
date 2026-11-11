import { defeatPlayer, patchUnit, relocateUnit, writableTiles, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { canCaptureAt } from '../rules';
import { NO_OWNER, type Action } from '../types';
import { hpPips } from '../units';
import { beginUnitAction, type ActionError } from './common';

export function applyCapture(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Capture' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  const tile = ctx.destination;
  if (!canCaptureAt(ruleset, draft.state, ctx.unit, tile)) return 'Nothing to capture here';

  const unit = relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  patchUnit(draft, unit.id, { moved: true });

  const remaining = draft.state.capture[tile]! - hpPips(ruleset, unit.hp);
  const capture = writableTiles(draft, 'capture');
  if (remaining > 0) {
    capture[tile] = remaining;
    draft.events.push({ type: 'CaptureProgress', unit: unit.id, at: tile, remaining });
    return null;
  }

  capture[tile] = ruleset.rules.capturePoints;
  const previousOwner = draft.state.owner[tile]!;
  writableTiles(draft, 'owner')[tile] = unit.owner;
  draft.events.push({ type: 'Captured', at: tile, by: unit.owner });

  if (previousOwner !== NO_OWNER && ruleset.terrain[draft.state.terrain[tile]!]!.isHq) {
    defeatPlayer(ruleset, draft, previousOwner, 'hq', unit.owner);
  }
  return null;
}
