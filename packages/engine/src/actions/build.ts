import { addUnit, patchPlayer, writableTiles, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { NO_UNIT, type Action } from '../types';
import { unitCost } from '../units';
import type { ActionError } from './common';

export function applyBuild(
  ruleset: CompiledRuleset,
  draft: Draft,
  action: Extract<Action, { type: 'Build' }>,
): ActionError {
  const state = draft.state;
  const { at, unitType } = action;
  if (!Number.isInteger(at) || at < 0 || at >= state.width * state.height) {
    return 'Build tile is off the map';
  }
  const player = state.activePlayer;
  if (state.owner[at] !== player) return 'You do not own this property';
  if (state.occupant[at] !== NO_UNIT) return 'Property is occupied';
  if (!ruleset.terrain[state.terrain[at]!]!.builds.includes(unitType)) {
    return 'That unit cannot be built here';
  }
  const cost = unitCost(ruleset, state, player, unitType);
  const funds = state.players[player]!.funds;
  if (funds < cost) return 'Not enough funds';

  const def = ruleset.units[unitType]!;
  const id = state.nextUnitId;
  draft.state.nextUnitId = id + 1;
  patchPlayer(draft, player, { funds: funds - cost });
  addUnit(draft, {
    id,
    type: unitType,
    owner: player,
    pos: at,
    hp: ruleset.rules.maxHp,
    fuel: def.maxFuel,
    ammo: def.maxAmmo,
    moved: true,
    cargo: [],
    carrier: NO_UNIT,
  });
  writableTiles(draft, 'occupant')[at] = id;
  draft.events.push({ type: 'UnitBuilt', unit: id, at });
  return null;
}
