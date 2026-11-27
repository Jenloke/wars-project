import { describe, expect, it } from 'vitest';
import { bubbleBox, intelSide, openArea, tileBox } from '../src/ui/hudLayout';

const board = { width: 800, height: 600 };
const panel = { width: 300, height: 120 };
/** A 48 px tile at (left, top). */
const tile = (left: number, top: number) => ({ left, top, width: 48, height: 48 });

describe('tile boxes', () => {
  it('place a tile on the board in CSS pixels at any display scaling', () => {
    const viewport = { width: 1000, height: 750, dpr: 1.25 };
    // 60 device-pixel tiles; tile 12 of a 10-wide map is column 2, row 1.
    expect(tileBox(12, 10, { x: -40, y: 20, zoom: 1 }, viewport)).toEqual({
      left: 128,
      top: 32,
      width: 48,
      height: 48,
    });
  });

  it('measure the part of the board the HUD leaves open', () => {
    const viewport = {
      width: 1000,
      height: 750,
      dpr: 1.25,
      insets: { top: 75, right: 0, bottom: 0, left: 0 },
    };
    expect(openArea(viewport)).toEqual({ left: 0, top: 60, width: 800, height: 540 });
  });
});

describe('the info panel', () => {
  it('stays in its corner while the cursor is elsewhere', () => {
    expect(intelSide('right', tile(100, 100), panel, board, 8)).toBe('right');
    expect(intelSide('right', null, panel, board, 8)).toBe('right');
  });

  it('moves to the other corner when the cursor goes under it, and stays there', () => {
    expect(intelSide('right', tile(600, 500), panel, board, 8)).toBe('left');
    expect(intelSide('left', tile(600, 500), panel, board, 8)).toBe('left');
    expect(intelSide('left', tile(50, 500), panel, board, 8)).toBe('right');
  });

  it('stays put when it would cover the cursor in either corner', () => {
    const wide = { width: 500, height: 120 };
    expect(intelSide('right', tile(376, 500), wide, board, 8)).toBe('right');
  });
});

describe('the forecast bubble', () => {
  const open = { left: 0, top: 60, width: 800, height: 540 };
  const bubble = { width: 150, height: 54 };

  it('sits centred above its target', () => {
    expect(bubbleBox(tile(300, 300), bubble, open, 8)).toEqual({
      left: 249,
      top: 238,
      width: 150,
      height: 54,
      below: false,
    });
  });

  it('drops below a target too close to the HUD, and stays inside the board', () => {
    expect(bubbleBox(tile(0, 80), bubble, open, 8)).toMatchObject({
      left: 8,
      top: 136,
      below: true,
    });
    expect(bubbleBox(tile(760, 300), bubble, open, 8)).toMatchObject({ left: 642 });
  });
});
