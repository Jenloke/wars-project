import type { TileIndex } from '@tactics/engine';
import { NO_INSETS, tileSize, type Camera, type Viewport } from '../render/camera';

/**
 * Where HUD pieces go on the board. Pure functions of the camera and sizes, in
 * CSS pixels relative to the board's top-left corner.
 */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where a tile is drawn on the board. */
export function tileBox(
  tile: TileIndex,
  mapWidth: number,
  camera: Camera,
  viewport: Viewport,
): Box {
  const size = tileSize(camera, viewport);
  const toCss = 1 / viewport.dpr;
  return {
    left: ((tile % mapWidth) * size - camera.x) * toCss,
    top: (Math.floor(tile / mapWidth) * size - camera.y) * toCss,
    width: size * toCss,
    height: size * toCss,
  };
}

/** The board's size and the part of it the HUD leaves open, in CSS pixels. */
export function openArea(viewport: Viewport): Box {
  const insets = viewport.insets ?? NO_INSETS;
  const toCss = 1 / viewport.dpr;
  return {
    left: insets.left * toCss,
    top: insets.top * toCss,
    width: (viewport.width - insets.left - insets.right) * toCss,
    height: (viewport.height - insets.top - insets.bottom) * toCss,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

export type Side = 'left' | 'right';

/** Where a panel docked in a bottom corner of the board sits. */
export function cornerBox(side: Side, panel: Size, board: Size, margin: number): Box {
  return {
    left: side === 'left' ? margin : board.width - margin - panel.width,
    top: board.height - margin - panel.height,
    width: panel.width,
    height: panel.height,
  };
}

/**
 * Which bottom corner the info panel docks in. It stays where it is until the
 * cursor goes under it, then moves to the other corner, unless the cursor
 * would be under it there too.
 */
export function intelSide(
  current: Side,
  cursor: Box | null,
  panel: Size,
  board: Size,
  margin: number,
): Side {
  if (cursor === null || !overlaps(cornerBox(current, panel, board, margin), cursor)) {
    return current;
  }
  const other: Side = current === 'left' ? 'right' : 'left';
  return overlaps(cornerBox(other, panel, board, margin), cursor) ? current : other;
}

/**
 * Where a bubble pointing at `target` goes: centred above it, or below it when
 * there is no room above, kept within the open area horizontally.
 */
export function bubbleBox(
  target: Box,
  bubble: Size,
  open: Box,
  gap: number,
): Box & { below: boolean } {
  const below = target.top - gap - bubble.height < open.top;
  const centred = target.left + target.width / 2 - bubble.width / 2;
  const left = Math.max(
    open.left + gap,
    Math.min(centred, open.left + open.width - gap - bubble.width),
  );
  return {
    left,
    top: below ? target.top + target.height + gap : target.top - gap - bubble.height,
    width: bubble.width,
    height: bubble.height,
    below,
  };
}
