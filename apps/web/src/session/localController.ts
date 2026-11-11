import type { Action, PlayerController } from '@tactics/engine';

/**
 * A player at this device. The game loop asks for an action and waits; the UI
 * answers by calling `submit` once the player has confirmed an input.
 */
export class LocalController implements PlayerController {
  readonly kind = 'local';
  private pending: ((action: Action) => void) | null = null;

  requestAction(): Promise<Action> {
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  /** Delivers the player's action. Returns false if the loop is not waiting. */
  submit(action: Action): boolean {
    const resolve = this.pending;
    if (resolve === null) return false;
    this.pending = null;
    resolve(action);
    return true;
  }

  onRejected(error: string): void {
    console.warn(`Action rejected: ${error}`);
  }
}
