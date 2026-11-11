import type { TileIndex } from './types';

export function tileIndex(x: number, y: number, width: number): TileIndex {
  return y * width + x;
}

export function tileX(tile: TileIndex, width: number): number {
  return tile % width;
}

export function tileY(tile: TileIndex, width: number): number {
  return (tile / width) | 0;
}

export function manhattan(a: TileIndex, b: TileIndex, width: number): number {
  const dx = (a % width) - (b % width);
  const dy = ((a / width) | 0) - ((b / width) | 0);
  return (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
}

export function areAdjacent(a: TileIndex, b: TileIndex, width: number): boolean {
  return manhattan(a, b, width) === 1;
}

/**
 * Writes the orthogonal neighbours of `tile` into `out` (north, east, south, west,
 * skipping those off the map) and returns how many were written. `out` must have
 * room for 4 entries; reusing one buffer keeps callers allocation-free.
 */
export function neighbours(
  tile: TileIndex,
  width: number,
  height: number,
  out: Int32Array | number[],
): number {
  const x = tile % width;
  const y = (tile / width) | 0;
  let n = 0;
  if (y > 0) out[n++] = tile - width;
  if (x < width - 1) out[n++] = tile + 1;
  if (y < height - 1) out[n++] = tile + width;
  if (x > 0) out[n++] = tile - 1;
  return n;
}
