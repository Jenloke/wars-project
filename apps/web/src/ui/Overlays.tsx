import type { PlayerIndex, WinReason } from '@tactics/engine';
import { useEffect, useState } from 'react';
import { openGameDialog, openNewGameDialog } from '../input/interaction';
import { armiesOf } from '../session/armies';
import { ruleset, session } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { armyStyle } from './armyStyle';
import { unitsLostToFuel } from './fuelLosses';
import { useGameState } from './hooks';
import { Portrait } from './Portrait';
import { Icon } from './SpriteSvg';

/** Space between the top HUD and the turn banner, in CSS pixels. */
const BANNER_GAP = 10;

const REASONS: Readonly<Record<WinReason, string>> = {
  hq: 'The enemy headquarters was captured.',
  rout: 'The enemy army was destroyed.',
  resign: 'The enemy conceded.',
};

/**
 * Announces whose turn it is, and any of their units that crashed or sank for
 * want of fuel as the turn began. Remounts (and so replays) on every turn change.
 */
export function TurnBanner() {
  const state = useGameState();
  const top = useUiStore((ui) => ui.hudInsets.top) + BANNER_GAP;
  const [lost, setLost] = useState<readonly string[]>([]);
  useEffect(() => {
    // Events arrive before the new state is published, so the banner that
    // mounts for the new turn already has its losses.
    const stopEvents = session.onEvents((previous, _next, events) => {
      if (events.some((event) => event.type === 'TurnStarted')) {
        setLost(unitsLostToFuel(ruleset, previous, events));
      }
    });
    const stopReset = session.onReset(() => setLost([]));
    return () => {
      stopEvents();
      stopReset();
    };
  }, []);
  if (state.status.kind !== 'playing') return null;
  const army = armiesOf(ruleset, state)[state.activePlayer]!;
  return (
    <div
      key={`${state.day}-${state.activePlayer}`}
      className="turn-banner"
      style={{ ...armyStyle(army.color), top }}
      role="status"
    >
      <Portrait sprite={army.portrait} ramp={army.ramp} size={36} />
      <span className="turn-banner-text">
        <span className="turn-banner-title">
          <span className="turn-banner-day">
            <Icon name="day" />
            Day {state.day}
          </span>
          <strong>{army.name}</strong>
          {state.players[state.activePlayer]!.controller === 'ai' && (
            <Icon name="computer" label="Computer" />
          )}
        </span>
        {lost.length > 0 && (
          <span className="banner-loss">
            <Icon name="fuel" />
            Out of fuel: {lost.join(', ')}
          </span>
        )}
      </span>
    </div>
  );
}

interface Activation {
  readonly player: PlayerIndex;
  /** Distinguishes two activations in a row, so the banner replays. */
  readonly serial: number;
}

/** Announces a commander's power, with their portrait, as it is activated. */
export function PowerBanner() {
  const state = useGameState();
  const [shown, setShown] = useState<Activation | null>(null);
  useEffect(() => {
    let serial = 0;
    const stopEvents = session.onEvents((_previous, _next, events) => {
      for (const event of events) {
        if (event.type === 'PowerActivated') setShown({ player: event.player, serial: ++serial });
      }
    });
    const stopReset = session.onReset(() => setShown(null));
    return () => {
      stopEvents();
      stopReset();
    };
  }, []);
  if (shown === null) return null;
  const army = armiesOf(ruleset, state)[shown.player];
  const power = ruleset.commanders[state.players[shown.player]?.commander ?? 0]?.power;
  if (army === undefined || power === null || power === undefined) return null;
  return (
    <div
      key={shown.serial}
      className="power-banner"
      style={{ ...armyStyle(army.color), borderColor: army.color }}
      role="status"
      onAnimationEnd={() => setShown(null)}
    >
      <Portrait sprite={army.portrait} ramp={army.ramp} size={72} />
      <div>
        <div className="power-banner-name army-ink">
          <Icon name="power" />
          {power.name}
        </div>
        <div className="muted">
          {army.commanderName} · {army.name}
        </div>
      </div>
    </div>
  );
}

export function GameOver() {
  const state = useGameState();
  if (state.status.kind !== 'won') return null;
  const army = armiesOf(ruleset, state)[state.status.winner]!;
  return (
    <div className="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className="game-over-card" style={armyStyle(army.color)}>
        <div className="game-over-portrait">
          <Portrait sprite={army.portrait} ramp={army.ramp} size={96} label={army.commanderName} />
          <Icon name="trophy" className="game-over-trophy" />
        </div>
        <h1 id="game-over-title" className="army-ink">
          {army.name} wins
        </h1>
        <p>{REASONS[state.status.reason]}</p>
        <p className="muted">
          {army.commanderName} · Day {state.day}
        </p>
        <div className="game-over-actions">
          <button type="button" className="with-icon" onClick={openGameDialog}>
            <Icon name="open" />
            Load a save
          </button>
          <button type="button" className="primary with-icon" autoFocus onClick={openNewGameDialog}>
            <Icon name="newGame" mono />
            New game…
          </button>
        </div>
      </div>
    </div>
  );
}
