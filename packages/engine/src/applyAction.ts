import { applyAttack } from './actions/attack';
import { applyBuild } from './actions/build';
import { applyCapture } from './actions/capture';
import type { ActionError } from './actions/common';
import { applyJoin } from './actions/join';
import { applyMove } from './actions/move';
import { applySupply } from './actions/supply';
import { applyLoad, applyUnload } from './actions/transport';
import { advanceTurn, applyEndTurn, applyResign } from './actions/turn';
import { createDraft, type Draft } from './draft';
import type { CompiledRuleset } from './ruleset';
import type { Action, ActionResult, GameState } from './types';

function dispatch(ruleset: CompiledRuleset, draft: Draft, action: Action): ActionError {
  switch (action.type) {
    case 'Move':
      return applyMove(ruleset, draft, action);
    case 'Attack':
      return applyAttack(ruleset, draft, action);
    case 'Capture':
      return applyCapture(ruleset, draft, action);
    case 'Join':
      return applyJoin(ruleset, draft, action);
    case 'Load':
      return applyLoad(ruleset, draft, action);
    case 'Unload':
      return applyUnload(ruleset, draft, action);
    case 'Supply':
      return applySupply(ruleset, draft, action);
    case 'Build':
      return applyBuild(ruleset, draft, action);
    case 'EndTurn':
      return applyEndTurn(ruleset, draft);
    case 'Resign':
      return applyResign(ruleset, draft);
    default: {
      const unknown: never = action;
      return `Unknown action ${JSON.stringify(unknown)}`;
    }
  }
}

/**
 * The game reducer. Deterministic and pure: the input state is never modified,
 * and an illegal action returns an error without producing a new state. Every
 * way of changing a game (local input, AI, network, replay, load) goes through
 * this function.
 */
export function applyAction(
  ruleset: CompiledRuleset,
  state: GameState,
  action: Action,
): ActionResult {
  if (state.status.kind !== 'playing') return { ok: false, error: 'The game is over' };

  const draft = createDraft(state);
  const error = dispatch(ruleset, draft, action);
  if (error !== null) return { ok: false, error };

  // A player can be eliminated on their own turn (resigning, or losing their last
  // unit to a counterattack). If the game goes on, the turn passes immediately.
  if (
    draft.state.status.kind === 'playing' &&
    !draft.state.players[draft.state.activePlayer]!.alive
  ) {
    advanceTurn(ruleset, draft);
  }
  return { ok: true, state: draft.state, events: draft.events };
}

/**
 * Replays an action log from an initial state. Throws if any action is illegal,
 * which means the log does not belong to that state or ruleset.
 */
export function replay(
  ruleset: CompiledRuleset,
  initial: GameState,
  actions: readonly Action[],
): GameState {
  let state = initial;
  for (let i = 0; i < actions.length; i++) {
    const result = applyAction(ruleset, state, actions[i]!);
    if (!result.ok) throw new Error(`Replay failed at action ${i}: ${result.error}`);
    state = result.state;
  }
  return state;
}
