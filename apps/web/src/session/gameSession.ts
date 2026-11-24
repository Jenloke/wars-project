import {
  applyAction,
  createGame,
  createSave,
  type Action,
  type CompiledRuleset,
  type ControllerKind,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MapData,
  type PlayerController,
  type PlayerIndex,
  type RestoredGame,
  type SaveData,
} from '@tactics/engine';
import { AiController } from './aiController';
import { LocalController } from './localController';

export type Listener = () => void;
export type EventListener = (
  previous: GameState,
  next: GameState,
  events: readonly GameEvent[],
) => void;

/** Creates the controller for one seat of a game. */
export type ControllerFactory = (kind: ControllerKind, seat: PlayerIndex) => PlayerController;

/**
 * Computer seats get an AI; everything else is played on this device. Remote
 * seats arrive with network play and fall back to local play until then.
 */
export const defaultControllers: ControllerFactory = (kind) =>
  kind === 'ai' ? new AiController() : new LocalController();

/**
 * A fresh game on `map`, ready to hand to `GameSession`. `seats` says who plays
 * each player slot; slots it does not cover are played on this device.
 */
export function newGameRecord(
  ruleset: CompiledRuleset,
  map: MapData,
  seed: number,
  seats: readonly ControllerKind[] = [],
): RestoredGame {
  const setup: GameSetup = {
    seed: seed >>> 0,
    players: map.players.map((_slot, i) => ({ controller: seats[i] ?? 'local' })),
  };
  const initial = createGame(ruleset, map, setup);
  return { map, setup, initial, actions: [], state: initial };
}

/**
 * Owns one game at a time: its map and setup, the action log, and the loop that
 * asks each player's controller for actions and feeds them through the engine
 * reducer. Exposes `subscribe`/`getState` for React's `useSyncExternalStore`.
 */
export class GameSession {
  private game: RestoredGame;
  private actions: Action[] = [];
  private state: GameState;
  private controllers: PlayerController[] = [];
  /** Bumped by `load` so a superseded loop stops at its next step. */
  private generation = 0;
  private readonly stateListeners = new Set<Listener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly resetListeners = new Set<Listener>();

  constructor(
    readonly ruleset: CompiledRuleset,
    game: RestoredGame,
    private readonly createController: ControllerFactory = defaultControllers,
  ) {
    this.game = game;
    this.state = game.state;
    this.start(game);
  }

  getState = (): GameState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  /** Subscribes to the events of each applied action, for animation. */
  onEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Subscribes to a different game being started or loaded. */
  onReset(listener: Listener): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  get actionCount(): number {
    return this.actions.length;
  }

  /** The current game's map and seat setup. */
  get map(): MapData {
    return this.game.map;
  }

  get setup(): GameSetup {
    return this.game.setup;
  }

  /** True if the active player gives their orders on this device. */
  isLocalTurn(): boolean {
    return this.controllers[this.state.activePlayer] instanceof LocalController;
  }

  /**
   * Snapshot of the current game as a save. The action log is copied so the
   * save stays consistent with `state` even if play continues afterwards.
   */
  toSave(savedAt: string): SaveData {
    const { map, setup } = this.game;
    return createSave(
      this.ruleset,
      { map, setup, actions: this.actions.slice(), state: this.state },
      savedAt,
    );
  }

  /** Submits an action for the active player if they are playing on this device. */
  submit(action: Action): boolean {
    const controller = this.controllers[this.state.activePlayer];
    return controller instanceof LocalController && controller.submit(action);
  }

  /** Replaces the current game, for a new game or a loaded save. */
  load(game: RestoredGame): void {
    this.generation++;
    this.game = game;
    this.state = game.state;
    this.start(game);
    for (const listener of this.resetListeners) listener();
    for (const listener of this.stateListeners) listener();
  }

  private start(game: RestoredGame): void {
    this.actions = game.actions.slice();
    this.controllers = game.setup.players.map((player, seat) =>
      this.createController(player.controller, seat),
    );
    void this.run(this.generation);
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
      this.actions.push(action);
      for (const listener of this.eventListeners) listener(previous, result.state, result.events);
      for (const listener of this.stateListeners) listener();
    }
  }
}
