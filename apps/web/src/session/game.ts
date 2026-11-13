import { DEFAULT_MAP_ID, maps, readSave, ruleset as rawRuleset } from '@tactics/content';
import { compileRuleset, type RestoredGame } from '@tactics/engine';
import { startAutosave } from '../saves/autosave';
import { MemoryStorage, openBrowserStorage, SaveStore } from '../saves/saveStore';
import { GameSession, newGameRecord } from './gameSession';

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export const ruleset = compileRuleset(rawRuleset);

const browserStorage = openBrowserStorage();
/** False when saves only last until the page closes (storage blocked). */
export const savesPersist = browserStorage !== null;
export const saveStore = new SaveStore(browserStorage ?? new MemoryStorage());

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
  return newGameRecord(ruleset, maps.get(DEFAULT_MAP_ID), randomSeed());
}

/** The single running game for this page. */
export const session = new GameSession(ruleset, resumeOrStart());
export const autosave = startAutosave(session, saveStore);

export function startNewGame(mapId: string = DEFAULT_MAP_ID): void {
  session.load(newGameRecord(ruleset, maps.get(mapId), randomSeed()));
}
