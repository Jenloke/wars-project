import { NO_TILE, NO_UNIT, type TileIndex, type UnitId, type UnitOptions } from '@tactics/engine';
import { create } from 'zustand';
import type { Camera, Viewport } from '../render/camera';

/**
 * Where the player is in the select -> move -> act flow.
 *
 * idle -> moving -> actionMenu -> (targeting | unloading) -> idle
 * idle -> buildMenu | mapMenu -> idle
 */
export type Mode =
  | 'idle'
  | 'moving'
  | 'actionMenu'
  | 'targeting'
  | 'unloading'
  | 'buildMenu'
  | 'mapMenu';

/**
 * UI state only. The game itself lives in `GameSession`; nothing here is needed
 * to reproduce a game, and nothing here is saved.
 */
export interface UiState {
  readonly mode: Mode;
  readonly cursor: TileIndex;
  readonly selectedUnit: UnitId;
  /** Per tile: move cost for the selected unit, or -1. Null when nothing is selected. */
  readonly reach: Int16Array | null;
  /** Tiles the selected unit will walk, excluding its own. */
  readonly path: readonly TileIndex[];
  readonly options: UnitOptions | null;
  /** Tiles to choose between while targeting or unloading. */
  readonly targets: readonly TileIndex[];
  /** Cargo being unloaded. */
  readonly cargo: UnitId;
  /** Tile a build or map menu was opened on. */
  readonly menuTile: TileIndex;
  /** True while an action's animation plays; input is ignored. */
  readonly animating: boolean;
  readonly camera: Camera;
  readonly viewport: Viewport;
}

export const IDLE_SELECTION = {
  mode: 'idle',
  selectedUnit: NO_UNIT,
  reach: null,
  path: [],
  options: null,
  targets: [],
  cargo: NO_UNIT,
  menuTile: NO_TILE,
} as const satisfies Partial<UiState>;

export const useUiStore = create<UiState>(() => ({
  ...IDLE_SELECTION,
  cursor: 0,
  animating: false,
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { width: 1, height: 1, dpr: 1 },
}));

/** True for modes where a DOM menu has keyboard focus. */
export function isMenuMode(mode: Mode): boolean {
  return mode === 'actionMenu' || mode === 'buildMenu' || mode === 'mapMenu';
}
