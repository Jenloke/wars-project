import {
  areAdjacent,
  canStopAt,
  computeMoveField,
  createMoveField,
  getBuildOptions,
  getUnitOptions,
  IMPASSABLE,
  NO_TILE,
  NO_UNIT,
  pathTo,
  UNREACHABLE,
  type Action,
  type GameState,
  type MoveField,
  type TileIndex,
  type UnitId,
} from '@tactics/engine';
import { clampCamera, panToTile, zoomAt } from '../render/camera';
import { autosave, ruleset, session } from '../session/game';
import { IDLE_SELECTION, useUiStore } from '../store/uiStore';

/**
 * The select -> move -> act flow. Every function here reads the game state and
 * the UI store, and either updates the UI store or submits one engine action.
 * Nothing here changes game state directly.
 */

export type UnitCommand = 'attack' | 'capture' | 'supply' | 'join' | 'load' | 'wait';

let field: MoveField = createMoveField(0);

function moveFieldFor(state: GameState, unit: UnitId): MoveField {
  const tiles = state.width * state.height;
  if (field.cost.length !== tiles) field = createMoveField(tiles);
  return computeMoveField(ruleset, state, unit, field);
}

function pathCost(state: GameState, unit: UnitId, path: readonly TileIndex[]): number {
  const row = ruleset.units[state.units[unit]!.type]!.moveType * ruleset.terrainCount;
  let cost = 0;
  for (const tile of path) cost += ruleset.moveCost[row + state.terrain[tile]!]!;
  return cost;
}

/** Tile the selected unit will end on: the end of the path, or where it stands. */
function destinationOf(state: GameState): TileIndex {
  const { path, selectedUnit } = useUiStore.getState();
  return path.length > 0 ? path[path.length - 1]! : state.units[selectedUnit]!.pos;
}

function isBusy(): boolean {
  const { animating, dialogOpen } = useUiStore.getState();
  return animating || dialogOpen || session.getState().status.kind !== 'playing';
}

function resetSelection(): void {
  useUiStore.setState(IDLE_SELECTION);
}

function submit(action: Action): void {
  resetSelection();
  session.submit(action);
}

/**
 * Grows the previewed path toward `tile` the way the player drew it: stepping
 * onto an adjacent tile extends the path, stepping back along it trims it, and
 * anything else (or running out of movement) falls back to the cheapest route.
 */
function extendPath(state: GameState, tile: TileIndex): void {
  const { path, selectedUnit } = useUiStore.getState();
  const origin = state.units[selectedUnit]!.pos;
  if (tile === origin) {
    useUiStore.setState({ path: [] });
    return;
  }
  if (field.cost[tile] === UNREACHABLE) return;

  const existing = path.indexOf(tile);
  if (existing >= 0) {
    useUiStore.setState({ path: path.slice(0, existing + 1) });
    return;
  }
  const last = path.length > 0 ? path[path.length - 1]! : origin;
  if (areAdjacent(last, tile, state.width)) {
    const extended = [...path, tile];
    const cost = pathCost(state, selectedUnit, extended);
    if (cost < IMPASSABLE && cost <= field.budget) {
      useUiStore.setState({ path: extended });
      return;
    }
  }
  useUiStore.setState({ path: pathTo(field, tile, []) });
}

/** Moves the cursor to a tile, as far as the current mode allows. */
export function moveCursor(tile: TileIndex): void {
  if (tile === NO_TILE || isBusy()) return;
  const ui = useUiStore.getState();
  if (tile === ui.cursor) return;
  const state = session.getState();

  switch (ui.mode) {
    case 'idle':
      useUiStore.setState({ cursor: tile });
      break;
    case 'moving':
      useUiStore.setState({ cursor: tile });
      extendPath(state, tile);
      break;
    case 'targeting':
    case 'unloading':
      if (ui.targets.includes(tile)) useUiStore.setState({ cursor: tile });
      break;
    default:
      return; // a menu is open
  }
  const { camera, viewport } = useUiStore.getState();
  const panned = panToTile(camera, viewport, useUiStore.getState().cursor, state.width);
  if (panned !== camera && (panned.x !== camera.x || panned.y !== camera.y)) {
    useUiStore.setState({ camera: clampCamera(panned, viewport, state.width, state.height) });
  }
}

/** Keyboard cursor movement. While choosing a target it cycles through targets. */
export function stepCursor(dx: number, dy: number): void {
  if (isBusy()) return;
  const ui = useUiStore.getState();
  const state = session.getState();
  if (ui.mode === 'targeting' || ui.mode === 'unloading') {
    const count = ui.targets.length;
    const index = ui.targets.indexOf(ui.cursor);
    const next = (index + (dx + dy > 0 ? 1 : -1) + count) % count;
    moveCursor(ui.targets[next]!);
    return;
  }
  const x = Math.max(0, Math.min(state.width - 1, (ui.cursor % state.width) + dx));
  const y = Math.max(0, Math.min(state.height - 1, Math.floor(ui.cursor / state.width) + dy));
  moveCursor(y * state.width + x);
}

function confirmIdle(state: GameState, tile: TileIndex): void {
  const unitId = state.occupant[tile]!;
  const unit = unitId === NO_UNIT ? undefined : state.units[unitId];
  if (unit !== undefined && unit.owner === state.activePlayer && !unit.moved) {
    const reach = moveFieldFor(state, unitId).cost;
    useUiStore.setState({ mode: 'moving', selectedUnit: unitId, reach, path: [] });
    return;
  }
  const canBuild = unit === undefined && getBuildOptions(ruleset, state, tile).length > 0;
  useUiStore.setState({ mode: canBuild ? 'buildMenu' : 'mapMenu', menuTile: tile });
}

function confirmMove(state: GameState, tile: TileIndex): void {
  const { selectedUnit } = useUiStore.getState();
  const unit = state.units[selectedUnit]!;
  const destination = destinationOf(state);
  if (tile !== destination) {
    // Confirming somewhere the unit cannot go drops the selection.
    if (field.cost[tile] === UNREACHABLE) resetSelection();
    return;
  }
  if (!canStopAt(ruleset, state, unit, destination)) return;
  useUiStore.setState({
    mode: 'actionMenu',
    options: getUnitOptions(ruleset, state, selectedUnit, destination),
    menuTile: destination,
  });
}

/** Confirms at the cursor: select, pick a destination, or pick a target. */
export function confirm(): void {
  if (isBusy()) return;
  const ui = useUiStore.getState();
  const state = session.getState();
  switch (ui.mode) {
    case 'idle':
      confirmIdle(state, ui.cursor);
      break;
    case 'moving':
      confirmMove(state, ui.cursor);
      break;
    case 'targeting':
      submit({ type: 'Attack', unit: ui.selectedUnit, path: ui.path, target: ui.cursor });
      break;
    case 'unloading':
      submit({
        type: 'Unload',
        unit: ui.selectedUnit,
        path: ui.path,
        drops: [{ cargo: ui.cargo, to: ui.cursor }],
      });
      break;
    default:
      break;
  }
}

/** A click or tap on a tile. Picking a target takes one click to aim, one to fire. */
export function clickTile(tile: TileIndex): void {
  if (tile === NO_TILE || isBusy()) return;
  const ui = useUiStore.getState();
  if (ui.mode === 'targeting' || ui.mode === 'unloading') {
    if (!ui.targets.includes(tile)) return;
    if (tile === ui.cursor) confirm();
    else moveCursor(tile);
    return;
  }
  if (ui.mode !== 'idle' && ui.mode !== 'moving') return;
  moveCursor(tile);
  confirm();
}

/** Steps back one stage of the flow. */
export function cancel(): void {
  const ui = useUiStore.getState();
  const state = session.getState();
  switch (ui.mode) {
    case 'targeting':
    case 'unloading':
      useUiStore.setState({ mode: 'actionMenu', targets: [], cursor: destinationOf(state) });
      break;
    case 'actionMenu':
      useUiStore.setState({ mode: 'moving', options: null });
      break;
    default:
      resetSelection();
  }
}

/** Runs a command chosen from the unit action menu. */
export function chooseCommand(command: UnitCommand): void {
  if (isBusy()) return;
  const ui = useUiStore.getState();
  if (ui.mode !== 'actionMenu' || ui.options === null) return;
  const { selectedUnit: unit, path } = ui;
  switch (command) {
    case 'attack': {
      const targets = ui.options.attackTargets;
      if (targets.length === 0) return;
      useUiStore.setState({ mode: 'targeting', targets, cursor: targets[0]! });
      break;
    }
    case 'capture':
      submit({ type: 'Capture', unit, path });
      break;
    case 'supply':
      submit({ type: 'Supply', unit, path });
      break;
    case 'join':
      submit({ type: 'Join', unit, path });
      break;
    case 'load':
      submit({ type: 'Load', unit, path });
      break;
    case 'wait':
      submit({ type: 'Move', unit, path });
      break;
  }
}

/** Starts choosing where to drop one carried unit. */
export function chooseUnload(cargo: UnitId): void {
  if (isBusy()) return;
  const ui = useUiStore.getState();
  const option = ui.options?.unloads.find((unload) => unload.cargo === cargo);
  if (ui.mode !== 'actionMenu' || option === undefined) return;
  useUiStore.setState({
    mode: 'unloading',
    cargo,
    targets: option.tiles,
    cursor: option.tiles[0]!,
  });
}

export function chooseBuild(unitType: number): void {
  if (isBusy()) return;
  const { mode, menuTile } = useUiStore.getState();
  if (mode === 'buildMenu') submit({ type: 'Build', at: menuTile, unitType });
}

export function openMapMenu(): void {
  if (isBusy()) return;
  const ui = useUiStore.getState();
  if (ui.mode === 'idle') useUiStore.setState({ mode: 'mapMenu', menuTile: ui.cursor });
}

/** Opens the save and load dialog, dropping any half-finished order. */
export function openGameDialog(): void {
  // Write a pending autosave first, so the autosave slot shows the latest move.
  autosave.flush();
  useUiStore.setState({ ...IDLE_SELECTION, dialogOpen: true });
}

export function closeGameDialog(): void {
  useUiStore.setState({ dialogOpen: false });
}

export function endTurn(): void {
  if (!isBusy()) submit({ type: 'EndTurn' });
}

export function resign(): void {
  if (!isBusy()) submit({ type: 'Resign' });
}

/** Zooms by whole steps around a point in canvas device pixels (default: centre). */
export function zoomBy(delta: number, anchorX?: number, anchorY?: number): void {
  const { camera, viewport } = useUiStore.getState();
  const state = session.getState();
  const next = zoomAt(
    camera,
    camera.zoom + delta,
    anchorX ?? viewport.width / 2,
    anchorY ?? viewport.height / 2,
  );
  useUiStore.setState({ camera: clampCamera(next, viewport, state.width, state.height) });
}

export function panBy(dx: number, dy: number): void {
  const { camera, viewport } = useUiStore.getState();
  const state = session.getState();
  const next = { ...camera, x: camera.x + dx, y: camera.y + dy };
  useUiStore.setState({ camera: clampCamera(next, viewport, state.width, state.height) });
}
