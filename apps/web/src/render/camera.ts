import { CELL } from '@tactics/sprites';
import { NO_TILE, type TileIndex } from '@tactics/engine';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Top-left of the view in world device pixels, plus an integer zoom level. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Canvas backing-store size in device pixels and the device pixel ratio. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/**
 * Device pixels per sprite pixel. Always an integer so every sprite pixel maps to
 * a whole block of device pixels, whatever the display scaling.
 */
export function renderScale(camera: Camera, viewport: Viewport): number {
  return camera.zoom * Math.max(1, Math.round(viewport.dpr));
}

/** Size of one tile in device pixels. */
export function tileSize(camera: Camera, viewport: Viewport): number {
  return CELL * renderScale(camera, viewport);
}

function clampAxis(offset: number, world: number, view: number): number {
  // A map smaller than the view is centred; otherwise it cannot scroll past its edges.
  if (world <= view) return -Math.floor((view - world) / 2);
  return Math.max(0, Math.min(world - view, Math.round(offset)));
}

export function clampCamera(
  camera: Camera,
  viewport: Viewport,
  mapWidth: number,
  mapHeight: number,
): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(camera.zoom)));
  const tile = tileSize({ ...camera, zoom }, viewport);
  return {
    zoom,
    x: clampAxis(camera.x, mapWidth * tile, viewport.width),
    y: clampAxis(camera.y, mapHeight * tile, viewport.height),
  };
}

/** Changes zoom while keeping the world point under `(anchorX, anchorY)` fixed. */
export function zoomAt(
  camera: Camera,
  zoom: number,
  anchorX: number,
  anchorY: number,
): Camera {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const ratio = next / camera.zoom;
  return {
    zoom: next,
    x: (camera.x + anchorX) * ratio - anchorX,
    y: (camera.y + anchorY) * ratio - anchorY,
  };
}

/** Scrolls the least distance needed to bring a tile fully into view. */
export function panToTile(
  camera: Camera,
  viewport: Viewport,
  tile: TileIndex,
  mapWidth: number,
): Camera {
  const size = tileSize(camera, viewport);
  const left = (tile % mapWidth) * size;
  const top = Math.floor(tile / mapWidth) * size;
  let { x, y } = camera;
  if (left < x) x = left;
  else if (left + size > x + viewport.width) x = left + size - viewport.width;
  if (top < y) y = top;
  else if (top + size > y + viewport.height) y = top + size - viewport.height;
  return { ...camera, x, y };
}

/** Tile under a point given in device pixels relative to the canvas, or `NO_TILE`. */
export function tileAtPoint(
  camera: Camera,
  viewport: Viewport,
  pointX: number,
  pointY: number,
  mapWidth: number,
  mapHeight: number,
): TileIndex {
  const size = tileSize(camera, viewport);
  const x = Math.floor((pointX + camera.x) / size);
  const y = Math.floor((pointY + camera.y) / size);
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return NO_TILE;
  return y * mapWidth + x;
}
