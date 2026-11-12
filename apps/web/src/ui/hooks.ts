import type { GameState } from '@tactics/engine';
import { useEffect, useSyncExternalStore } from 'react';
import { cancel, confirm, openMapMenu, stepCursor, zoomBy } from '../input/interaction';
import { session } from '../session/game';
import { isMenuMode, useUiStore } from '../store/uiStore';

/** The current game state. Re-renders the component whenever an action is applied. */
export function useGameState(): GameState {
  return useSyncExternalStore(session.subscribe, session.getState);
}

const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

/** Global keyboard controls for the map. Open menus handle their own keys. */
export function useKeyboardControls(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // The modal dialog handles its own keys, including Escape.
      if (useUiStore.getState().dialogOpen) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (key === 'Escape' || key === 'x' || key === 'Backspace') {
        event.preventDefault();
        cancel();
        return;
      }
      if (isMenuMode(useUiStore.getState().mode)) return;
      // A focused button handles Enter and Space itself.
      if (event.target instanceof HTMLButtonElement && (key === 'Enter' || key === ' ')) return;

      const step = STEPS[key];
      if (step !== undefined) {
        event.preventDefault();
        stepCursor(step[0], step[1]);
      } else if (key === 'Enter' || key === ' ' || key === 'z') {
        event.preventDefault();
        confirm();
      } else if (key === 'e') {
        openMapMenu();
      } else if (key === '+' || key === '=') {
        zoomBy(1);
      } else if (key === '-') {
        zoomBy(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
