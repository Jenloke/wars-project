import {
  defeatPlayer,
  destroyUnit,
  patchPlayer,
  patchUnit,
  resupplyUnit,
  supplyAdjacent,
  type Draft,
} from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { NO_OWNER, NO_TILE, type PlayerIndex, type TileIndex, type UnitId } from '../types';
import { unitCost } from '../units';
import type { ActionError } from './common';

/** Unit IDs owned by `player`, in ascending (deterministic) order. */
function unitIdsOf(draft: Draft, player: PlayerIndex): UnitId[] {
  const ids: UnitId[] = [];
  const units = draft.state.units;
  for (const key in units) {
    const unit = units[key as unknown as UnitId]!;
    if (unit.owner === player) ids.push(unit.id);
  }
  return ids;
}

/** Heals a unit standing on a repairing property, as far as funds allow. */
function repairUnit(ruleset: CompiledRuleset, draft: Draft, id: UnitId): void {
  const rules = ruleset.rules;
  let unit = draft.state.units[id]!;
  let healed = 0;
  while (healed < rules.repairHp && unit.hp < rules.maxHp) {
    const step = Math.min(rules.hpPerPip, rules.maxHp - unit.hp, rules.repairHp - healed);
    const price = Math.floor(
      (unitCost(ruleset, draft.state, unit.owner, unit.type) * step) / rules.maxHp,
    );
    const funds = draft.state.players[unit.owner]!.funds;
    if (funds < price) break;
    patchPlayer(draft, unit.owner, { funds: funds - price });
    unit = patchUnit(draft, id, { hp: unit.hp + step });
    healed += step;
  }
}

/** Uses each unit's daily fuel. Units carried in a transport use none. */
function burnFuel(ruleset: CompiledRuleset, draft: Draft, ids: readonly UnitId[]): void {
  for (const id of ids) {
    const unit = draft.state.units[id]!;
    const def = ruleset.units[unit.type]!;
    const use = unit.dived ? def.divedFuelPerDay : def.fuelPerDay;
    if (use === 0 || unit.pos === NO_TILE || unit.fuel === 0) continue;
    patchUnit(draft, id, { fuel: unit.fuel > use ? unit.fuel - use : 0 });
  }
}

/** Removes units that cannot fly or float on an empty tank. */
function loseEmptyUnits(ruleset: CompiledRuleset, draft: Draft, ids: readonly UnitId[]): void {
  for (const id of ids) {
    // An earlier loss may have routed the player and removed the rest.
    const unit = draft.state.units[id];
    if (unit === undefined || unit.pos === NO_TILE || unit.fuel > 0) continue;
    if (ruleset.units[unit.type]!.lostWithoutFuel) destroyUnit(ruleset, draft, id, 'fuel');
  }
}

/**
 * Start-of-turn upkeep for `player`: income, daily fuel use, repair and resupply,
 * then the loss of anything left with an empty tank. Resupply comes before the
 * loss, so a unit that ends its turn on an airport or beside a supply unit is safe.
 */
function startTurn(ruleset: CompiledRuleset, draft: Draft, player: PlayerIndex): void {
  const state = draft.state;

  let properties = 0;
  const owner = state.owner;
  for (let tile = 0; tile < owner.length; tile++) {
    if (owner[tile] === player) properties++;
  }
  patchPlayer(draft, player, {
    funds: state.players[player]!.funds + properties * state.incomePerProperty,
  });

  const ids = unitIdsOf(draft, player);
  burnFuel(ruleset, draft, ids);
  const suppliedTiles: TileIndex[] = [];
  for (const id of ids) {
    const unit = draft.state.units[id]!;
    if (unit.pos === NO_TILE) continue;
    const def = ruleset.units[unit.type]!;
    if (
      state.owner[unit.pos] === player &&
      ruleset.terrain[state.terrain[unit.pos]!]!.repairs[def.moveType] === 1
    ) {
      resupplyUnit(ruleset, draft, id);
      repairUnit(ruleset, draft, id);
    }
    if (def.canSupply) {
      suppliedTiles.length = 0;
      supplyAdjacent(ruleset, draft, unit.pos, player, suppliedTiles);
    }
  }
  loseEmptyUnits(ruleset, draft, ids);
  if (draft.state.players[player]!.alive) {
    draft.events.push({ type: 'TurnStarted', player, day: draft.state.day });
  }
}

/** Hands the turn to the next living player and runs their upkeep. */
export function advanceTurn(ruleset: CompiledRuleset, draft: Draft): void {
  const state = draft.state;
  const current = state.activePlayer;
  for (const id of unitIdsOf(draft, current)) {
    if (state.units[id]!.moved) patchUnit(draft, id, { moved: false });
  }

  const count = state.players.length;
  let next = current;
  do {
    next = (next + 1) % count;
  } while (!state.players[next]!.alive && next !== current);

  if (next <= current) state.day += 1;
  state.activePlayer = next;
  startTurn(ruleset, draft, next);
}

export function applyEndTurn(ruleset: CompiledRuleset, draft: Draft): ActionError {
  advanceTurn(ruleset, draft);
  return null;
}

export function applyResign(ruleset: CompiledRuleset, draft: Draft): ActionError {
  defeatPlayer(ruleset, draft, draft.state.activePlayer, 'resign', NO_OWNER);
  return null;
}
