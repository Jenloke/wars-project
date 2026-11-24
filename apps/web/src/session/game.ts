import { DEFAULT_MAP_ID, maps, readSave, ruleset as rawRuleset } from '@tactics/content';
import { compileRuleset, type ControllerKind, type RestoredGame } from '@tactics/engine';
import { startAutosave } from '../saves/autosave';
import { MemoryStorage, openBrowserStorage, SaveStore } from '../saves/saveStore';
import { useUiStore } from '../store/uiStore';
import { AiController } from './aiController';
import { GameSession, newGameRecord, type ControllerFactory } from './gameSession';
import { LocalController } from './localController';

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export const ruleset = compileRuleset(rawRuleset);

/** Seats of a new game nobody has set up yet: you against the computer. */
export const DEFAULT_SEATS: readonly ControllerKind[] = ['local', 'ai'];

const browserStorage = openBrowserStorage();
/** False when saves only last until the page closes (storage blocked). */
export const savesPersist = browserStorage !== null;
export const saveStore = new SaveStore(browserStorage ?? new MemoryStorage());

/**
 * Resolves once the board can show another computer move: the last action has
 * finished animating and no dialog covers the map.
 */
function boardReady(): Promise<void> {
  const isReady = () => {
    const { animating, dialogOpen } = useUiStore.getState();
    return !animating && !dialogOpen;
  };
  if (isReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useUiStore.subscribe(() => {
      if (!isReady()) return;
      unsubscribe();
      resolve();
    });
  });
}

const controllers: ControllerFactory = (kind) =>
  kind === 'ai' ? new AiController({ ready: boardReady }) : new LocalController();

/** Resumes the autosaved game if it is still in progress, so a refresh loses nothing. */
function resumeOrStart(): RestoredGame {
  const text = saveStore.read('auto');
  if (text !== null) {
    try {
      const game = readSave(text, ruleset);
      if (game.state.status.kind === 'playing') return game;
    } catch (error) {
      console.warn('The autosave could not be resumed; starting a new game.', error);
    }
  }
  return newGameRecord(ruleset, maps.get(DEFAULT_MAP_ID), randomSeed(), DEFAULT_SEATS);
}

/** The single running game for this page. */
export const session = new GameSession(ruleset, resumeOrStart(), controllers);
export const autosave = startAutosave(session, saveStore);

/** Starts a new game on `mapId`, with `seats` saying who plays each player slot. */
export function startNewGame(
  seats: readonly ControllerKind[] = DEFAULT_SEATS,
  mapId: string = DEFAULT_MAP_ID,
): void {
  session.load(newGameRecord(ruleset, maps.get(mapId), randomSeed(), seats));
}
