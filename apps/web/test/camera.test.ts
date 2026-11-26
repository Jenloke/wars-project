import { NO_TILE } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { tileAtPoint, tileSize } from '../src/render/camera';

const camera = { x: 0, y: 0, zoom: 1 };
const view = (dpr: number) => ({ width: 800, height: 600, dpr });

describe('camera', () => {
  it('sizes tiles in whole device pixels at any display scaling', () => {
    expect(tileSize(camera, view(1))).toBe(48);
    expect(tileSize(camera, view(1.25))).toBe(60);
    expect(tileSize(camera, view(1.5))).toBe(72);
    expect(tileSize(camera, view(1.1))).toBe(53);
    expect(tileSize({ ...camera, zoom: 2 }, view(1.5))).toBe(144);
    expect(tileSize(camera, view(0.001))).toBe(1);
  });

  it('finds the tile under a point at fractional scaling', () => {
    const viewport = view(1.25); // 60-pixel tiles
    expect(tileAtPoint(camera, viewport, 59, 0, 10, 10)).toBe(0);
    expect(tileAtPoint(camera, viewport, 60, 0, 10, 10)).toBe(1);
    expect(tileAtPoint({ ...camera, x: 30, y: 60 }, viewport, 30, 0, 10, 10)).toBe(11);
    expect(tileAtPoint(camera, viewport, 600, 0, 10, 10)).toBe(NO_TILE);
  });
});
