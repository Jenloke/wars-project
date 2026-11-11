import { patchUnit, relocateUnit, writableTiles, type Draft } from '../draft';
import { areAdjacent } from '../grid';
import type { CompiledRuleset } from '../ruleset';
import { canDropAt, canEnterTerrain, canLoadInto } from '../rules';
import { NO_TILE, NO_UNIT, type Action } from '../types';
import { beginUnitAction, type ActionError } from './common';

export function applyLoad(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Load' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'friendly');
  if (typeof ctx === 'string') return ctx;
  const transport = draft.state.units[draft.state.occupant[ctx.destination]!]!;
  if (!canLoadInto(ruleset, ctx.unit, transport)) return 'Unit cannot board that transport';

  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, false);
  patchUnit(draft, action.unit, { pos: NO_TILE, carrier: transport.id, moved: true });
  patchUnit(draft, transport.id, { cargo: [...transport.cargo, action.unit] });
  draft.events.push({ type: 'Loaded', unit: action.unit, into: transport.id });
  return null;
}

export function applyUnload(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Unload' }>,
): ActionError {
  const ctx = beginUnitAction(ruleset, draft, action.unit, action.path, 'empty');
  if (typeof ctx === 'string') return ctx;
  const state = draft.state;
  const drops = action.drops;
  if (!Array.isArray(drops) || drops.length === 0) return 'Nothing to unload';

  const tileCount = state.width * state.height;
  const origin = ctx.unit.pos;
  // The transport's old tile is free once it has moved away.
  const vacated = origin === ctx.destination ? NO_TILE : origin;

  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i]!;
    if (!ctx.unit.cargo.includes(drop.cargo)) return 'Unit is not carried by this transport';
    if (!Number.isInteger(drop.to) || drop.to < 0 || drop.to >= tileCount) {
      return 'Drop tile is off the map';
    }
    if (!areAdjacent(ctx.destination, drop.to, state.width)) {
      return 'Drop tile is not next to the transport';
    }
    const cargo = state.units[drop.cargo]!;
    if (!canEnterTerrain(ruleset, state, cargo.type, ctx.destination)) {
      return 'Cargo cannot disembark from this terrain';
    }
    if (!canDropAt(ruleset, state, cargo, drop.to, vacated)) return 'Drop tile is blocked';
    for (let j = 0; j < i; j++) {
      if (drops[j]!.cargo === drop.cargo) return 'Unit is unloaded twice';
      if (drops[j]!.to === drop.to) return 'Two units are dropped on the same tile';
    }
  }

  relocateUnit(ruleset, draft, ctx.unit, action.path, ctx.cost, true);
  const occupant = writableTiles(draft, 'occupant');
  for (const drop of drops) {
    patchUnit(draft, drop.cargo, { pos: drop.to, carrier: NO_UNIT, moved: true });
    occupant[drop.to] = drop.cargo;
    draft.events.push({ type: 'Unloaded', unit: drop.cargo, from: action.unit, to: drop.to });
  }
  patchUnit(draft, action.unit, {
    cargo: ctx.unit.cargo.filter((id) => !drops.some((drop) => drop.cargo === id)),
    moved: true,
  });
  return null;
}
