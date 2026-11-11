import type { CompiledRuleset } from './ruleset';
import type { Action, ControllerKind, GameState } from './types';

/**
 * Source of actions for one player. Hot-seat input, AI and network peers all
 * implement this, so the game loop does not care who is playing.
 */
export interface PlayerController {
  readonly kind: ControllerKind;
  /** Resolves with the player's next action for `state`. */
  requestAction(state: GameState, ruleset: CompiledRuleset): Promise<Action>;
  /** Called when the last action from this controller was rejected. */
  onRejected?(error: string): void;
}
