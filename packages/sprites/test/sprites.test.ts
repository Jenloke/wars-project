import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  palette,
  parseSpriteSvg,
  rasterize,
  SpriteLibrary,
  spriteIdOf,
  sprites,
  TEAM_PLACEHOLDERS,
  teamRamp,
  type SpriteFrame,
} from '../src/index';

function svg(...polygons: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${polygons.join('')}</svg>`;
}

function polygon(points: string, fill: string = palette.grass): string {
  return `<polygon points="${points}" fill="${fill}"/>`;
}

/** Number of opaque pixels in a raster. */
function painted(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 255) count++;
  return count;
}

function pixelAt(pixels: Uint8ClampedArray, size: number, x: number, y: number): number {
  const at = (y * size + x) * 4;
  return (pixels[at]! << 16) | (pixels[at + 1]! << 8) | pixels[at + 2]!;
}

describe('the shipped sprites', () => {
  it('all pass the art rules and load at startup', () => {
    expect(sprites.ids().length).toBeGreaterThan(50);
    for (const id of ['unit.tank', 'building.base', 'terrain.road.5', 'ui.cursor', 'fx.puff']) {
      expect(sprites.has(id)).toBe(true);
    }
  });

  it('give units two idle frames and team colours', () => {
    const tank = sprites.get('unit.tank');
    expect(tank.frames).toHaveLength(2);
    expect(tank.team).toBe(true);
    expect(sprites.get('terrain.forest').team).toBe(false);
  });
});

describe('parsing', () => {
  it('reads polygons, fills and team placeholders', () => {
    const frame = parseSpriteSvg(
      svg(polygon('0,0 48,0 48,48'), polygon('1 2, 3 4, 5 6', TEAM_PLACEHOLDERS[2])),
      'test.svg',
    );
    expect(frame.polygons).toEqual([
      { points: [0, 0, 48, 0, 48, 48], rgb: hexToRgb(palette.grass), team: -1 },
      { points: [1, 2, 3, 4, 5, 6], rgb: hexToRgb(TEAM_PLACEHOLDERS[2]), team: 2 },
    ]);
  });

  it('enforces the art rules', () => {
    const bad = (source: string) => () => parseSpriteSvg(source, 'bad.svg');
    expect(bad(svg('<circle r="4" fill="#ffffff"/>'))).toThrow(/bad.svg: <circle> is not allowed/);
    expect(bad(svg(polygon('0,0 1,0 1,1', '#123456')))).toThrow(/not in the palette/);
    expect(bad(svg('<polygon points="0,0 1,0 1,1" fill="#ffffff" stroke="#000000"/>'))).toThrow(
      /strokes/,
    );
    expect(bad(svg(polygon('0,0 1,0')))).toThrow(/three x,y pairs/);
    expect(bad(svg())).toThrow(/no polygons/);
    expect(bad(svg(polygon('0,0 1,0 1,1')).replace('0 0 48 48', '0 0 32 32'))).toThrow(/viewBox/);
  });
});

describe('sprite IDs and frames', () => {
  it('derive the ID from the path and the frame from an .fN suffix', () => {
    expect(spriteIdOf('unit/tank.f1.svg')).toEqual({ id: 'unit.tank', frame: 1 });
    expect(spriteIdOf('terrain/coast.12.svg')).toEqual({ id: 'terrain.coast.12', frame: 0 });
    expect(spriteIdOf('unit/naval/sub.svg')).toEqual({ id: 'unit.naval.sub', frame: 0 });
  });

  it('refuses frame numbering with gaps', () => {
    const source = svg(polygon('0,0 1,0 1,1'));
    expect(() =>
      SpriteLibrary.fromSources({ 'unit/a.f0.svg': source, 'unit/a.f2.svg': source }),
    ).toThrow(/without gaps/);
  });

  it('resolves the first sprite that has art, and accepts sprites added at runtime', () => {
    const library = SpriteLibrary.fromSources({ 'unit/unknown.svg': svg(polygon('0,0 1,0 1,1')) });
    expect(library.resolve(['unit.custom', 'unit.unknown'])?.id).toBe('unit.unknown');
    const frame: SpriteFrame = { polygons: [{ points: [0, 0, 9, 0, 9, 9], rgb: 0, team: 0 }] };
    expect(library.add('unit.custom', [frame]).team).toBe(true);
    expect(library.resolve(['unit.custom', 'unit.unknown'])?.id).toBe('unit.custom');
    expect(() => library.get('unit.missing')).toThrow(/Missing sprite "unit.missing"/);
  });
});

describe('rasterizing', () => {
  const quadrant = parseSpriteSvg(svg(polygon('0,0 24,0 24,24 0,24')), 'quadrant.svg');

  it('fills exactly the pixels whose centres lie inside, at any size', () => {
    expect(painted(rasterize(quadrant, 48))).toBe(24 * 24);
    expect(painted(rasterize(quadrant, 96))).toBe(48 * 48);
    expect(painted(rasterize(quadrant, 100))).toBe(50 * 50);
    // 61 px: the edge at 30.5 px leaves column and row 30 outside.
    expect(painted(rasterize(quadrant, 61))).toBe(30 * 30);
  });

  it('paints later polygons over earlier ones', () => {
    const frame = parseSpriteSvg(
      svg(
        polygon('0,0 48,0 48,48 0,48', palette.sea),
        polygon('0,0 48,0 48,24 0,24', palette.sand),
      ),
      'layers.svg',
    );
    const pixels = rasterize(frame, 48);
    expect(painted(pixels)).toBe(48 * 48);
    expect(pixelAt(pixels, 48, 10, 10)).toBe(hexToRgb(palette.sand));
    expect(pixelAt(pixels, 48, 10, 40)).toBe(hexToRgb(palette.sea));
  });

  it('recolours team placeholders and shades every painted pixel', () => {
    const frame = parseSpriteSvg(
      svg(polygon('0,0 48,0 48,48 0,48', TEAM_PLACEHOLDERS[1])),
      'team.svg',
    );
    const ramp = teamRamp(1).map(hexToRgb);
    expect(pixelAt(rasterize(frame, 8, { ramp }), 8, 3, 3)).toBe(ramp[1]);
    expect(pixelAt(rasterize(frame, 8), 8, 3, 3)).toBe(hexToRgb(TEAM_PLACEHOLDERS[1]));
    const shaded = rasterize(frame, 8, { ramp, shade: { rgb: 0x000000, amount: 0.5 } });
    const half = ((ramp[1]! >> 16) & 255) / 2;
    expect((pixelAt(shaded, 8, 3, 3) >> 16) & 255).toBe(Math.round(half));
    expect(teamRamp(-1)).not.toEqual(teamRamp(0));
  });
});
