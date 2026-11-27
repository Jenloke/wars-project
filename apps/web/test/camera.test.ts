import { NO_TILE } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { clampCamera, panToTile, tileAtPoint, tileSize } from '../src/render/camera';

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

  it('centres a map that fits in the part of the view the HUD leaves open', () => {
    const viewport = { ...view(1), insets: { top: 60, right: 0, bottom: 20, left: 100 } };
    // 10 x 5 tiles of 48 px: 480 x 240 in an open area of 700 x 520.
    expect(clampCamera(camera, viewport, 10, 5)).toEqual({ zoom: 1, x: -210, y: -200 });
    expect(clampCamera(camera, view(1), 10, 5)).toEqual({ zoom: 1, x: -160, y: -180 });
  });

  it('lets a large map scroll its edges clear of the HUD, and no further', () => {
    const viewport = { ...view(1), insets: { top: 60, right: 0, bottom: 0, left: 0 } };
    // 40 x 30 tiles: 1920 x 1440.
    expect(clampCamera({ ...camera, x: -500, y: -500 }, viewport, 40, 30)).toMatchObject({
      x: 0,
      y: -60,
    });
    expect(clampCamera({ ...camera, x: 5000, y: 5000 }, viewport, 40, 30)).toMatchObject({
      x: 1120,
      y: 840,
    });
  });

  it('scrolls the cursor out from under the HUD', () => {
    const viewport = { ...view(1), insets: { top: 60, right: 0, bottom: 100, left: 0 } };
    // Row 1 starts at 48 px, under the 60 px top panel.
    expect(panToTile({ ...camera, y: 0 }, viewport, 40 + 3, 40)).toMatchObject({ y: -12 });
    // Row 10 ends at 528 px, under the bottom panel that starts at 500 px.
    expect(panToTile({ ...camera, y: 0 }, viewport, 400 + 3, 40)).toMatchObject({ y: 28 });
    // A tile already in the open part of the view does not scroll.
    expect(panToTile({ ...camera, y: 0 }, viewport, 200 + 3, 40)).toMatchObject({ y: 0 });
  });

  it('finds the tile under a point at fractional scaling', () => {
    const viewport = view(1.25); // 60-pixel tiles
    expect(tileAtPoint(camera, viewport, 59, 0, 10, 10)).toBe(0);
    expect(tileAtPoint(camera, viewport, 60, 0, 10, 10)).toBe(1);
    expect(tileAtPoint({ ...camera, x: 30, y: 60 }, viewport, 30, 0, 10, 10)).toBe(11);
    expect(tileAtPoint(camera, viewport, 600, 0, 10, 10)).toBe(NO_TILE);
  });
});
