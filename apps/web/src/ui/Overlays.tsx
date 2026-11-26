import { factions } from '@tactics/content';
import type { GameEvent, GameState, WinReason } from '@tactics/engine';
import { useEffect, useState } from 'react';
import { openGameDialog, openNewGameDialog } from '../input/interaction';
import { ruleset, session } from '../session/game';
import { useGameState } from './hooks';

const REASONS: Readonly<Record<WinReason, string>> = {
  hq: 'The enemy headquarters was captured.',
  rout: 'The enemy army was destroyed.',
  resign: 'The enemy conceded.',
};

/** Names of the units an action's events say ran out of fuel and were lost. */
function lostToFuel(previous: GameState, events: readonly GameEvent[]): string[] {
  const names: string[] = [];
  for (const event of events) {
    if (event.type !== 'UnitDestroyed' || event.cause !== 'fuel') continue;
    const unit = previous.units[event.unit];
    if (unit !== undefined) names.push(ruleset.units[unit.type]!.name);
  }
  return names;
}

/**
 * Announces whose turn it is, and any of their units that crashed or sank for
 * want of fuel as the turn began. Remounts (and so replays) on every turn change.
 */
export function TurnBanner() {
  const state = useGameState();
  const [lost, setLost] = useState<readonly string[]>([]);
  useEffect(() => {
    // Events arrive before the new state is published, so the banner that
    // mounts for the new turn already has its losses.
    const stopEvents = session.onEvents((previous, _next, events) => {
      if (events.some((event) => event.type === 'TurnStarted')) {
        setLost(lostToFuel(previous, events));
      }
    });
    const stopReset = session.onReset(() => setLost([]));
    return () => {
      stopEvents();
      stopReset();
    };
  }, []);
  if (state.status.kind !== 'playing') return null;
  const faction = factions[state.activePlayer];
  return (
    <div
      key={`${state.day}-${state.activePlayer}`}
      className="turn-banner"
      style={{ borderColor: faction?.color }}
      role="status"
    >
      Day {state.day} · {faction?.name ?? `Player ${state.activePlayer + 1}`}
      {state.players[state.activePlayer]!.controller === 'ai' && (
        <span className="muted"> · Computer</span>
      )}
      {lost.length > 0 && <span className="banner-loss"> · Out of fuel: {lost.join(', ')}</span>}
    </div>
  );
}

export function GameOver() {
  const state = useGameState();
  if (state.status.kind !== 'won') return null;
  const faction = factions[state.status.winner];
  return (
    <div className="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className="game-over-card">
        <h1 id="game-over-title" style={{ color: faction?.color }}>
          {faction?.name ?? `Player ${state.status.winner + 1}`} wins
        </h1>
        <p>{REASONS[state.status.reason]}</p>
        <p className="muted">Day {state.day}</p>
        <div className="game-over-actions">
          <button type="button" onClick={openGameDialog}>
            Load a save
          </button>
          <button type="button" className="primary" autoFocus onClick={openNewGameDialog}>
            New game…
          </button>
        </div>
      </div>
    </div>
  );
}
