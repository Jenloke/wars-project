import {
  applyAction,
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
 * In order of preference it takes the best attack, capture or supply with a
 * positive expected gain; then repositions one unit; then builds; then ends the
 * turn. Each of those either acts with a unit (which then counts as moved) or
 * fills a base, so repeated calls always reach `EndTurn`.
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
