import { canActivatePower } from '@tactics/engine';
import { activatePower, endTurn, openGameDialog, zoomBy } from '../input/interaction';
import { MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { armiesOf } from '../session/armies';
import { ruleset, session } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';
import { Portrait } from './Portrait';
import { PowerGauge } from './PowerGauge';

const HINTS: Readonly<Record<string, string>> = {
  idle: 'Select a unit or a base',
  moving: 'Choose where to move',
  actionMenu: 'Choose an order',
  targeting: 'Choose a target, then confirm',
  unloading: 'Choose where to unload',
  buildMenu: 'Choose a unit to build',
  mapMenu: '',
};

/** Day, the side to move with its commander and power meter, funds, and the controls. */
export function TopBar() {
  const state = useGameState();
  const mode = useUiStore((ui) => ui.mode);
  const zoom = useUiStore((ui) => ui.camera.zoom);
  const animating = useUiStore((ui) => ui.animating);
  const player = state.players[state.activePlayer]!;
  const army = armiesOf(ruleset, state)[state.activePlayer]!;
  const power = ruleset.commanders[player.commander]!.power;
  const playing = state.status.kind === 'playing';
  const localTurn = session.isLocalTurn();
  const canOrder = playing && localTurn && !animating;
  const hint = !playing ? '' : localTurn ? HINTS[mode] : `${army.name} is moving…`;

  return (
    <header className="top-bar">
      <div className="turn-info">
        <span className="day">Day {state.day}</span>
        <span className="faction" title={`${army.commanderName}, ${army.name}`}>
          <Portrait sprite={army.portrait} ramp={army.ramp} size={30} />
          <span className="army-name" style={{ color: army.color }}>
            {army.name}
          </span>
          {player.controller === 'ai' && <span className="badge">Computer</span>}
        </span>
        <span className="funds" title="Funds">
          {player.funds.toLocaleString()} G
        </span>
        <PowerGauge state={state} player={state.activePlayer} />
        {power !== null && canActivatePower(ruleset, state) && localTurn && (
          <button
            type="button"
            className="power-button"
            style={{ borderColor: army.color }}
            onClick={activatePower}
            disabled={!canOrder || (mode !== 'idle' && mode !== 'mapMenu')}
            title={`Activate ${power.name} (P)`}
          >
            {power.name}
          </button>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {hint}
      </p>
      <div className="controls">
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          +
        </button>
        <button type="button" onClick={openGameDialog}>
          Save / Load
        </button>
        <button
          type="button"
          className="primary"
          onClick={endTurn}
          disabled={!canOrder || mode !== 'idle'}
        >
          End turn
        </button>
      </div>
    </header>
  );
}
