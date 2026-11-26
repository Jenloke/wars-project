import {
  applyAction,
  canActivatePower,
  pathTo,
  type Action,
  type CompiledRuleset,
  type GameState,
} from '@tactics/engine';
import { reachOf, readBoard, type Board } from './board';
import { findMove } from './movement';
import { makePlan } from './plan';
import { findBuild } from './production';
import { DEFAULT_PROFILE, type AiProfile } from './profile';
import { findTactics, type Tactic } from './tactics';

const END_TURN: Action = { type: 'EndTurn' };
const ACTIVATE_POWER: Action = { type: 'ActivatePower' };

function tacticAction(board: Board, tactic: Tactic): Action {
  const unit = board.state.units[tactic.unit]!;
  const path = pathTo(reachOf(board, unit), tactic.destination, []);
  switch (tactic.kind) {
    case 'Attack':
      return { type: 'Attack', unit: unit.id, path, target: tactic.target };
    case 'Capture':
      return { type: 'Capture', unit: unit.id, path };
    case 'Supply':
      return { type: 'Supply', unit: unit.id, path };
  }
}

/**
 * The AI's next action for the active player. Call it once per action: it reads
 * the position afresh each time, so it reacts to how each attack actually landed.
 *
 * First of all it activates its commander's power once the meter is full, so
 * the rest of the turn is played with it (and a defensive power holds through
 * the enemy's turn). Then, in order of preference, it takes the best attack,
 * capture or supply with a positive expected gain; repositions one unit; builds;
 * then ends the turn. Each of those either uses the power (which cannot be used
 * again until it ends), acts with a unit (which then counts as moved) or fills a
 * base, so repeated calls always reach `EndTurn`.
 *
 * Deterministic: the same state and profile always give the same action. Every
 * action is checked with the reducer before it is returned, so it is legal.
 */
export function chooseAction(
  ruleset: CompiledRuleset,
  state: GameState,
  profile: AiProfile = DEFAULT_PROFILE,
): Action {
  if (state.status.kind !== 'playing') return END_TURN;
  const isLegal = (action: Action) => applyAction(ruleset, state, action).ok;
  if (canActivatePower(ruleset, state) && isLegal(ACTIVATE_POWER)) return ACTIVATE_POWER;
  const board = readBoard(ruleset, state, profile);
  const plan = makePlan(board);

  for (const tactic of findTactics(board)) {
    const action = tacticAction(board, tactic);
    if (isLegal(action)) return action;
  }
  const move = findMove(board, plan, isLegal);
  if (move !== null) return move;
  const build = findBuild(board, plan);
  if (build !== null && isLegal(build)) return build;
  return END_TURN;
}
