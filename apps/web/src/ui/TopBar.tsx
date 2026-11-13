import { factions } from '@tactics/content';
import { endTurn, openGameDialog, zoomBy } from '../input/interaction';
import { MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';

const HINTS: Readonly<Record<string, string>> = {
  idle: 'Select a unit or a base',
  moving: 'Choose where to move',
  actionMenu: 'Choose an order',
  targeting: 'Choose a target, then confirm',
  unloading: 'Choose where to unload',
  buildMenu: 'Choose a unit to build',
  mapMenu: '',
};

/** Day, active player, funds and the always-available controls. */
export function TopBar() {
  const state = useGameState();
  const mode = useUiStore((ui) => ui.mode);
  const zoom = useUiStore((ui) => ui.camera.zoom);
  const animating = useUiStore((ui) => ui.animating);
  const player = state.players[state.activePlayer]!;
  const faction = factions[state.activePlayer];
  const playing = state.status.kind === 'playing';

  return (
    <header className="top-bar">
      <div className="turn-info">
        <span className="day">Day {state.day}</span>
        <span className="faction">
          <span className="faction-dot" style={{ background: faction?.color }} />
          {faction?.name ?? `Player ${state.activePlayer + 1}`}
        </span>
        <span className="funds" title="Funds">
          {player.funds.toLocaleString()} G
        </span>
      </div>
      <p className="hint">{playing ? HINTS[mode] : ''}</p>
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
          disabled={!playing || animating || mode !== 'idle'}
        >
          End turn
        </button>
      </div>
    </header>
  );
}
