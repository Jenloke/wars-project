import { defeatPlayer, patchPlayer, patchUnit, type Draft } from '../draft';
import type { CompiledRuleset } from '../ruleset';
import { NO_OWNER, type PlayerIndex, type UnitId } from '../types';
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

/** Start-of-turn upkeep for `player`: income from owned properties. */
function startTurn(draft: Draft, player: PlayerIndex): void {
  const state = draft.state;

  let properties = 0;
  const owner = state.owner;
  for (let tile = 0; tile < owner.length; tile++) {
    if (owner[tile] === player) properties++;
  }
  patchPlayer(draft, player, {
    funds: state.players[player]!.funds + properties * state.incomePerProperty,
  });
  draft.events.push({ type: 'TurnStarted', player, day: draft.state.day });
}

/** Hands the turn to the next living player and runs their upkeep. */
export function advanceTurn(_ruleset: CompiledRuleset, draft: Draft): void {
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
  startTurn(draft, next);
}

export function applyEndTurn(ruleset: CompiledRuleset, draft: Draft): ActionError {
  advanceTurn(ruleset, draft);
  return null;
}

export function applyResign(ruleset: CompiledRuleset, draft: Draft): ActionError {
  defeatPlayer(ruleset, draft, draft.state.activePlayer, 'resign', NO_OWNER);
  return null;
}
