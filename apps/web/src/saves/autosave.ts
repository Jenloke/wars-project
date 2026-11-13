import type { GameSession } from '../session/gameSession';
import type { SaveStore } from './saveStore';

/** Quiet time after the last action before the autosave is written. */
const AUTOSAVE_DELAY_MS = 400;

export interface Autosave {
  /** Writes a pending autosave now. Does nothing if nothing changed. */
  flush(): void;
  stop(): void;
}

/**
 * Keeps the `auto` slot in step with the running game. Writes are debounced, so
 * a burst of actions costs one serialization, and flushed when the page is
 * hidden or closed, so a refresh or closed tab never loses a move.
 */
export function startAutosave(
  session: GameSession,
  store: SaveStore,
  delayMs: number = AUTOSAVE_DELAY_MS,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    try {
      store.write('auto', session.toSave(new Date().toISOString()));
    } catch (error) {
      // Play goes on; the save dialog reports storage problems when used.
      console.warn('Autosave failed', error);
    }
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const unsubscribe = session.subscribe(schedule);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    flush,
    stop() {
      flush();
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
