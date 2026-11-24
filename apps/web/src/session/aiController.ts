import { chooseAction } from '@tactics/ai';
import type { Action, CompiledRuleset, GameState, PlayerController } from '@tactics/engine';

/** Pause before each computer action, so a watching player can follow the moves. */
const THINK_MS = 250;

export interface AiControllerOptions {
  /**
   * Resolves when the screen is ready for the next action: the last one has
   * finished animating and no dialog is in the way. Defaults to always ready.
   */
  readonly ready?: () => Promise<void>;
  /** Pause before each action, in milliseconds. */
  readonly delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A computer player. It waits until the board is ready to show another move,
 * pauses briefly, then asks the AI for the move. It plays through the same
 * pipeline as a person: the session applies, logs and saves its actions.
 */
export class AiController implements PlayerController {
  readonly kind = 'ai';
  /** Set when the engine refused our last action; the next request ends the turn. */
  private refused = false;

  constructor(private readonly options: AiControllerOptions = {}) {}

  async requestAction(state: GameState, ruleset: CompiledRuleset): Promise<Action> {
    const { ready, delayMs = THINK_MS } = this.options;
    await ready?.();
    if (delayMs > 0) await sleep(delayMs);
    // A dialog may have opened during the pause.
    await ready?.();
    if (this.refused) {
      // The AI checks its moves with the reducer, so this means a bug. Ending the
      // turn keeps the game going instead of retrying the same move forever.
      this.refused = false;
      return { type: 'EndTurn' };
    }
    return chooseAction(ruleset, state);
  }

  onRejected(error: string): void {
    console.error(`The computer player made an illegal move: ${error}`);
    this.refused = true;
  }
}
