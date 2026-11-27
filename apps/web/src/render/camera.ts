import { NO_TILE, type TileIndex } from '@tactics/engine';
import { GRID } from '@tactics/sprites';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Top-left of the view in world device pixels, plus an integer zoom level. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Space at each edge of the view, in device pixels, covered by interface panels. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Canvas backing-store size in device pixels and the device pixel ratio. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /**
   * Edges covered by the HUD. A map that fits is centred in the rest of the
   * view, a larger one can scroll its edges clear of the HUD, and the cursor is
   * never scrolled under it.
   */
  readonly insets?: Insets | undefined;
}

/**
 * Size of one tile in device pixels: 48 CSS pixels per zoom step, at the
 * display's real pixel ratio. Always a whole number, so tiles meet without gaps;
 * sprites are vector art rasterized at exactly this size, so any ratio is crisp.
 */
export function tileSize(camera: Camera, viewport: Viewport): number {
  return Math.max(1, Math.round(GRID * camera.zoom * viewport.dpr));
}

/**
 * Camera offset on one axis. `before` and `after` are the view's covered edges:
 * a map that fits between them is centred there; a larger one cannot scroll
 * further than to bring its edges just clear of them.
 */
function clampAxis(
  offset: number,
  world: number,
  view: number,
  before: number,
  after: number,
): number {
  const open = view - before - after;
  if (world <= open) return 0 - before - Math.floor((open - world) / 2);
  return Math.max(0 - before, Math.min(world - view + after, Math.round(offset)));
}

export function clampCamera(
  camera: Camera,
  viewport: Viewport,
  mapWidth: number,
  mapHeight: number,
): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(camera.zoom)));
  const tile = tileSize({ ...camera, zoom }, viewport);
  const insets = viewport.insets ?? NO_INSETS;
  return {
    zoom,
    x: clampAxis(camera.x, mapWidth * tile, viewport.width, insets.left, insets.right),
    y: clampAxis(camera.y, mapHeight * tile, viewport.height, insets.top, insets.bottom),
  };
}

/** Changes zoom while keeping the world point under `(anchorX, anchorY)` fixed. */
export function zoomAt(camera: Camera, zoom: number, anchorX: number, anchorY: number): Camera {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const ratio = next / camera.zoom;
  return {
    zoom: next,
    x: (camera.x + anchorX) * ratio - anchorX,
    y: (camera.y + anchorY) * ratio - anchorY,
  };
}

/** Scrolls the least distance needed to bring a tile fully into the uncovered view. */
export function panToTile(
  camera: Camera,
  viewport: Viewport,
  tile: TileIndex,
  mapWidth: number,
): Camera {
  const size = tileSize(camera, viewport);
  const insets = viewport.insets ?? NO_INSETS;
  const left = (tile % mapWidth) * size;
  const top = Math.floor(tile / mapWidth) * size;
  let { x, y } = camera;
  if (left < x + insets.left) x = left - insets.left;
  else if (left + size > x + viewport.width - insets.right) {
    x = left + size - viewport.width + insets.right;
  }
  if (top < y + insets.top) y = top - insets.top;
  else if (top + size > y + viewport.height - insets.bottom) {
    y = top + size - viewport.height + insets.bottom;
  }
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
