import { factions } from '@tactics/content';
import type { WinReason } from '@tactics/engine';
import { startNewGame } from '../session/game';
import { useGameState } from './hooks';

const REASONS: Readonly<Record<WinReason, string>> = {
  hq: 'The enemy headquarters was captured.',
  rout: 'The enemy army was destroyed.',
  resign: 'The enemy conceded.',
};

/** Announces whose turn it is. Remounts (and so replays) on every turn change. */
export function TurnBanner() {
  const state = useGameState();
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
        <button type="button" className="primary" autoFocus onClick={() => startNewGame()}>
          New game
        </button>
      </div>
    </div>
  );
}
