import {
  applyAction,
  createGame,
  type Action,
  type CompiledRuleset,
  type GameEvent,
  type GameState,
  type MapData,
  type PlayerController,
} from '@tactics/engine';
import { LocalController } from './localController';

export type StateListener = () => void;
export type EventListener = (
  previous: GameState,
  next: GameState,
  events: readonly GameEvent[],
) => void;

/**
 * Owns one game: the current state, the action log, and the loop that asks each
 * player's controller for actions and feeds them through the engine reducer.
 * It exposes `subscribe`/`getState` for React's `useSyncExternalStore`.
 */
export class GameSession {
  private state: GameState;
  private initial: GameState;
  private log: Action[] = [];
  private controllers: PlayerController[] = [];
  /** Bumped by `newGame` so a superseded loop stops at its next step. */
  private generation = 0;
  private readonly stateListeners = new Set<StateListener>();
  private readonly eventListeners = new Set<EventListener>();

  constructor(
    readonly ruleset: CompiledRuleset,
    map: MapData,
    seed: number,
  ) {
    this.initial = this.state = this.create(map, seed);
    void this.run(this.generation);
  }

  getState = (): GameState => this.state;

  subscribe = (listener: StateListener): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  /** Subscribes to the events of each applied action, for animation. */
  onEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** The initial state and every action applied since: enough to replay or save. */
  getLog(): { readonly initial: GameState; readonly actions: readonly Action[] } {
    return { initial: this.initial, actions: this.log };
  }

  /** Submits an action for the active player if they are playing on this device. */
  submit(action: Action): boolean {
    const controller = this.controllers[this.state.activePlayer];
    return controller instanceof LocalController && controller.submit(action);
  }

  newGame(map: MapData, seed: number): void {
    this.generation++;
    this.log = [];
    this.initial = this.state = this.create(map, seed);
    for (const listener of this.stateListeners) listener();
    void this.run(this.generation);
  }

  private create(map: MapData, seed: number): GameState {
    this.controllers = map.players.map(() => new LocalController());
    return createGame(this.ruleset, map, {
      seed,
      players: this.controllers.map((controller) => ({ controller: controller.kind })),
    });
  }

  private async run(generation: number): Promise<void> {
    while (generation === this.generation && this.state.status.kind === 'playing') {
      const controller = this.controllers[this.state.activePlayer]!;
      const action = await controller.requestAction(this.state, this.ruleset);
      if (generation !== this.generation) return;

      const result = applyAction(this.ruleset, this.state, action);
      if (!result.ok) {
        controller.onRejected?.(result.error);
        continue;
      }
      const previous = this.state;
      this.state = result.state;
      this.log.push(action);
      for (const listener of this.eventListeners) listener(previous, result.state, result.events);
      for (const listener of this.stateListeners) listener();
    }
  }
}
