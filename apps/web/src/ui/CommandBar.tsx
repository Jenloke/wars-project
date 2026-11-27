import { canActivatePower, type GameState } from '@tactics/engine';
import { useLayoutEffect, useRef } from 'react';
import { activatePower, endTurn, openGameDialog, zoomBy } from '../input/interaction';
import { MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { armiesOf, type Army } from '../session/armies';
import { ruleset, session } from '../session/game';
import { useUiStore, type Mode } from '../store/uiStore';
import { armyStyle } from './armyStyle';
import { useGameState } from './hooks';
import type { IconName } from './icons';
import { Portrait } from './Portrait';
import { PowerGauge } from './PowerGauge';
import { sideStats } from './sides';
import { Icon } from './SpriteSvg';
import { cycleTheme, THEME_LABELS, type ThemeChoice } from './theme';

const HINTS: Readonly<Record<Mode, string>> = {
  idle: 'Select a unit or a base',
  moving: 'Choose where to move',
  actionMenu: 'Choose an order',
  targeting: 'Choose a target, then confirm',
  unloading: 'Choose where to unload',
  buildMenu: 'Choose a unit to build',
  mapMenu: '',
};

/** The side to move's power: a button once it is full on a turn played here, else its meter. */
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

interface SideRowProps {
  readonly state: GameState;
  readonly army: Army;
  readonly canOrder: boolean;
}

/** One side: who leads it, its funds and income, properties, units and power. */
function SideRow({ state, army, canOrder }: SideRowProps) {
  const side = state.players[army.seat]!;
  const active = army.seat === state.activePlayer;
  const stats = sideStats(ruleset, state, army.seat);
  const classes = ['side', active && 'active', !side.alive && 'out'].filter(Boolean).join(' ');
  return (
    <tr
      className={classes}
      style={armyStyle(army.color)}
      aria-current={active ? 'true' : undefined}
      title={side.alive ? undefined : `${army.name} has been defeated`}
    >
      <th scope="row" title={`${army.name}, ${army.commanderName}`}>
        <span className="side-who">
          <Portrait sprite={army.portrait} ramp={army.ramp} size={30} />
          <span className="side-names">
            <span className="side-army">
              {army.name}
              {side.controller === 'ai' && <Icon name="computer" label="Computer" />}
            </span>
            <span className="side-commander">{army.commanderName}</span>
          </span>
        </span>
      </th>
      <td
        className="side-funds"
        title={`Funds: ${stats.funds.toLocaleString()}, income ${stats.income.toLocaleString()} a day`}
      >
        <Icon name="funds" />
        <span className="visually-hidden">Funds</span>
        <strong>{stats.funds.toLocaleString()}</strong>
        <span className="side-income">+{stats.income.toLocaleString()}</span>
      </td>
      <td className="side-count" title={`Properties: ${stats.properties}`}>
        <Icon name="capture" ramp={army.ramp} />
        <span className="visually-hidden">Properties</span>
        {stats.properties}
      </td>
      <td className="side-count" title={`Units: ${stats.units}`}>
        <Icon name="units" ramp={army.ramp} />
        <span className="visually-hidden">Units</span>
        {stats.units}
      </td>
      <td className="side-power">
        {active ? (
          <PowerStatus state={state} canOrder={canOrder} />
        ) : (
          <PowerGauge state={state} player={army.seat} />
        )}
      </td>
    </tr>
  );
}

/**
 * Every side in one card, the side to move highlighted, beside the day: each
 * side's commander, funds and income, properties, units and power meter.
 */
function SidesCard({ state, canOrder }: { state: GameState; canOrder: boolean }) {
  const armies = armiesOf(ruleset, state);
  const toMove = armies[state.activePlayer]!;
  return (
    <section
      className="hud-panel sides-card"
      aria-label={`Day ${state.day}, ${toMove.name} to move`}
    >
      <div className="day-badge" aria-hidden="true">
        <Icon name="day" />
        <span className="day-label">Day</span>
        <span className="day-number">{state.day}</span>
      </div>
      <table className="sides">
        <tbody>
          {armies.map((army) => (
            <SideRow key={army.seat} state={state} army={army} canOrder={canOrder} />
          ))}
        </tbody>
      </table>
    </section>
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

const THEME_ICONS = {
  system: 'theme',
  light: 'day',
  dark: 'moon',
} as const satisfies Record<ThemeChoice, IconName>;

function Toolbar({ canOrder }: { canOrder: boolean }) {
  const mode = useUiStore((ui) => ui.mode);
  const zoom = useUiStore((ui) => ui.camera.zoom);
  const themeChoice = useUiStore((ui) => ui.themeChoice);
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
          onClick={cycleTheme}
          aria-label={THEME_LABELS[themeChoice]}
          title={`${THEME_LABELS[themeChoice]} (click to change)`}
        >
          <Icon name={THEME_ICONS[themeChoice]} />
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
 * The HUD along the top of the board: every side with the one to move
 * highlighted, a hint for the current step, and the game controls. Its height is reported as
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
        <SidesCard state={state} canOrder={canOrder} />
      </div>
      <Hint state={state} />
      <Toolbar canOrder={canOrder} />
    </header>
  );
}
