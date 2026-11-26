import { GRID, type Polygon, type SpriteFrame } from './svg';

export interface RasterOptions {
  /** Colours for the team placeholders (light, mid, dark, deep), as 0xRRGGBB. */
  readonly ramp?: readonly number[] | undefined;
  /** Blends every painted pixel toward `rgb` by `amount` (0..1), e.g. to dim a unit. */
  readonly shade?: { readonly rgb: number; readonly amount: number } | undefined;
}

/** Crossing points of one scanline, reused between calls. */
const crossings: number[] = [];

function fillPolygon(
  out: Uint8ClampedArray,
  size: number,
  polygon: Polygon,
  scale: number,
  rgb: number,
): void {
  const points = polygon.points;
  const count = points.length / 2;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < points.length; i += 2) {
    const y = points[i]! * scale;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  // Rows whose pixel centres lie between the polygon's top and bottom.
  const firstRow = Math.max(0, Math.ceil(minY - 0.5));
  const lastRow = Math.min(size - 1, Math.floor(maxY - 0.5));

  for (let row = firstRow; row <= lastRow; row++) {
    const y = row + 0.5;
    crossings.length = 0;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const yi = points[2 * i + 1]! * scale;
      const yj = points[2 * j + 1]! * scale;
      // Half-open test, so a vertex on the scanline is counted once.
      if (yi <= y === yj <= y) continue;
      const xi = points[2 * i]! * scale;
      const xj = points[2 * j]! * scale;
      crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    crossings.sort((left, right) => left - right);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // Pixels whose centre x + 0.5 lies in [left, right).
      const from = Math.max(0, Math.ceil(crossings[k]! - 0.5));
      const to = Math.min(size - 1, Math.ceil(crossings[k + 1]! - 0.5) - 1);
      for (let col = from; col <= to; col++) {
        const at = (row * size + col) * 4;
        out[at] = r;
        out[at + 1] = g;
        out[at + 2] = b;
        out[at + 3] = 255;
      }
    }
  }
}

function mix(rgb: number, toward: number, amount: number): number {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const from = (rgb >> shift) & 255;
    const to = (toward >> shift) & 255;
    out |= Math.round(from + (to - from) * amount) << shift;
  }
  return out;
}

/**
 * Paints a sprite frame into a new `size` x `size` RGBA buffer, polygons in order.
 * Edges are hard: a pixel takes a polygon's colour when its centre lies inside it,
 * the same rule as SVG `shape-rendering="crispEdges"`. Because sprites are vector
 * polygons, this gives crisp art at any size, not just multiples of the grid.
 */
export function rasterize(
  frame: SpriteFrame,
  size: number,
  options: RasterOptions = {},
): Uint8ClampedArray<ArrayBuffer> {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`Invalid sprite size ${size}`);
  const out = new Uint8ClampedArray(size * size * 4);
  const scale = size / GRID;
  const { ramp, shade } = options;
  for (const polygon of frame.polygons) {
    let rgb = polygon.team >= 0 && ramp !== undefined ? ramp[polygon.team]! : polygon.rgb;
    if (shade !== undefined) rgb = mix(rgb, shade.rgb, shade.amount);
    fillPolygon(out, size, polygon, scale, rgb);
  }
  return out;
}
