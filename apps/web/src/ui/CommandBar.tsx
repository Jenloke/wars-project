import { canActivatePower, type GameState } from '@tactics/engine';
import { useLayoutEffect, useRef } from 'react';
import { activatePower, endTurn, openGameDialog, zoomBy } from '../input/interaction';
import { MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { armiesOf } from '../session/armies';
import { ruleset, session } from '../session/game';
import { useUiStore, type Mode } from '../store/uiStore';
import { armyStyle } from './armyStyle';
import { useGameState } from './hooks';
import { Portrait } from './Portrait';
import { PowerGauge } from './PowerGauge';
import { Icon } from './SpriteSvg';

const HINTS: Readonly<Record<Mode, string>> = {
  idle: 'Select a unit or a base',
  moving: 'Choose where to move',
  actionMenu: 'Choose an order',
  targeting: 'Choose a target, then confirm',
  unloading: 'Choose where to unload',
  buildMenu: 'Choose a unit to build',
  mapMenu: '',
};

/**
 * The side to move's power: its meter while charging, a button once it is full
 * on a turn played here, or its name while it is in effect.
 */
function PowerStatus({ state, canOrder }: { state: GameState; canOrder: boolean }) {
  const mode = useUiStore((ui) => ui.mode);
  const side = state.players[state.activePlayer]!;
  const power = ruleset.commanders[side.commander]!.power;
  if (power === null) return null;
  if (canActivatePower(ruleset, state) && session.isLocalTurn()) {
    return (
      <button
        type="button"
        className="power-button"
        onClick={activatePower}
        disabled={!canOrder || (mode !== 'idle' && mode !== 'mapMenu')}
        title={`Activate ${power.name} (P)`}
      >
        <Icon name="power" />
        {power.name}
      </button>
    );
  }
  return <PowerGauge state={state} player={state.activePlayer} />;
}

/** The side to move: commander, army, day, funds and power. */
function ArmyCard({ state, canOrder }: { state: GameState; canOrder: boolean }) {
  const player = state.players[state.activePlayer]!;
  const army = armiesOf(ruleset, state)[state.activePlayer]!;
  return (
    <section
      className="hud-panel army-card"
      style={armyStyle(army.color)}
      aria-label={`${army.name} to move`}
    >
      <Portrait sprite={army.portrait} ramp={army.ramp} size={40} />
      <div className="army-card-body">
        <div className="army-card-row">
          <strong className="army-card-name">{army.name}</strong>
          {player.controller === 'ai' && (
            <Icon name="computer" label="Computer" className="army-card-cpu" />
          )}
          <span className="army-card-commander">{army.commanderName}</span>
          <span className="day-chip" title="Day">
            <Icon name="day" />
            Day {state.day}
          </span>
        </div>
        <div className="army-card-row">
          <span className="stat funds" title="Funds">
            <Icon name="funds" />
            <span className="stat-value">{player.funds.toLocaleString()}</span>
          </span>
          <PowerStatus state={state} canOrder={canOrder} />
        </div>
      </div>
    </section>
  );
}

/** The other sides still in the game, each with their power meter. */
function Rivals({ state }: { state: GameState }) {
  const armies = armiesOf(ruleset, state).filter(
    (army) => army.seat !== state.activePlayer && state.players[army.seat]!.alive,
  );
  if (armies.length === 0) return null;
  return (
    <ul className="rivals" aria-label="Other sides">
      {armies.map((army) => (
        <li
          key={army.seat}
          className="hud-panel rival"
          style={armyStyle(army.color)}
          title={`${army.commanderName}, ${army.name}`}
        >
          <Portrait
            sprite={army.portrait}
            ramp={army.ramp}
            size={28}
            label={`${army.commanderName}, ${army.name}`}
          />
          <PowerGauge state={state} player={army.seat} compact />
        </li>
      ))}
    </ul>
  );
}

function Hint({ state }: { state: GameState }) {
  const mode = useUiStore((ui) => ui.mode);
  if (state.status.kind !== 'playing') return <p className="hud-hint" aria-live="polite" />;
  if (!session.isLocalTurn()) {
    const army = armiesOf(ruleset, state)[state.activePlayer]!;
    return (
      <p className="hud-hint" aria-live="polite">
        <span className="hud-hint-pill">
          <Icon name="computer" />
          {army.commanderName} is thinking…
        </span>
      </p>
    );
  }
  const text = HINTS[mode];
  return (
    <p className="hud-hint" aria-live="polite">
      {text !== '' && (
        <span className="hud-hint-pill">
          {text}
          {mode !== 'idle' && <kbd>Esc</kbd>}
        </span>
      )}
    </p>
  );
}

function Toolbar({ canOrder }: { canOrder: boolean }) {
  const mode = useUiStore((ui) => ui.mode);
  const zoom = useUiStore((ui) => ui.camera.zoom);
  return (
    <div className="hud-tools" role="toolbar" aria-label="Game">
      <div className="hud-panel tool-group">
        <button
          type="button"
          className="tool"
          onClick={() => zoomBy(-1)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          <Icon name="zoomOut" />
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => zoomBy(1)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <Icon name="zoomIn" />
        </button>
        <button
          type="button"
          className="tool"
          onClick={openGameDialog}
          aria-label="Save and load"
          title="Save and load"
        >
          <Icon name="save" />
        </button>
      </div>
      <button
        type="button"
        className="primary end-turn"
        onClick={endTurn}
        disabled={!canOrder || mode !== 'idle'}
        aria-label="End turn"
        title="End turn"
      >
        <Icon name="endTurn" mono />
        <span className="end-turn-label">End turn</span>
      </button>
    </div>
  );
}

/**
 * The HUD along the top of the board: the side to move, the other sides, a
 * hint for the current step, and the game controls. Its height is reported as
 * the board's top inset, so the map is never scrolled under it.
 */
export function CommandBar() {
  const ref = useRef<HTMLElement>(null);
  const state = useGameState();
  const animating = useUiStore((ui) => ui.animating);
  const canOrder = state.status.kind === 'playing' && session.isLocalTurn() && !animating;

  useLayoutEffect(() => {
    const bar = ref.current;
    if (bar === null) return;
    const report = () => {
      const top = Math.ceil(bar.offsetHeight);
      const current = useUiStore.getState().hudInsets;
      if (current.top !== top) useUiStore.setState({ hudInsets: { ...current, top } });
    };
    const observer = new ResizeObserver(report);
    observer.observe(bar);
    report();
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="hud-top">
      <div className="hud-sides">
        <ArmyCard state={state} canOrder={canOrder} />
        <Rivals state={state} />
      </div>
      <Hint state={state} />
      <Toolbar canOrder={canOrder} />
    </header>
  );
}
