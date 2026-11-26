import { palette, TEAM_PLACEHOLDERS } from './palette';

/** Side of the square grid every sprite is authored on: its SVG viewBox. */
export const GRID = 48;

/** One flat-colour polygon of a sprite. */
export interface Polygon {
  /** Vertices on the 48-unit grid, as x0, y0, x1, y1, ... */
  readonly points: readonly number[];
  /** Fill colour as 0xRRGGBB. */
  readonly rgb: number;
  /** Index into a team ramp when the fill is a team placeholder, else -1. */
  readonly team: number;
}

/** One frame of a sprite: polygons painted in order, later ones on top. */
export interface SpriteFrame {
  readonly polygons: readonly Polygon[];
}

const ALLOWED_FILLS = new Set<string>([...Object.values(palette), ...TEAM_PLACEHOLDERS]);
const TEAM_INDEX = new Map<string, number>(TEAM_PLACEHOLDERS.map((colour, i) => [colour, i]));

export function hexToRgb(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * Parses one sprite frame from SVG source and enforces the art rules: a 48x48
 * viewBox, `<polygon>` elements only, and flat fills from the shared palette or
 * the team placeholders. No strokes, gradients, filters, opacity or styles, so
 * every sprite keeps the same low-poly look and can be recoloured per team.
 * Throws with `name` and the reason on any violation.
 */
export function parseSpriteSvg(source: string, name: string): SpriteFrame {
  const fail = (reason: string): never => {
    throw new Error(`${name}: ${reason}`);
  };
  if (!/viewBox="0 0 48 48"/.test(source)) fail('viewBox must be "0 0 48 48"');
  for (const match of source.matchAll(/<([a-zA-Z][\w:-]*)/g)) {
    const tag = match[1]!;
    if (tag !== 'svg' && tag !== 'polygon') fail(`<${tag}> is not allowed, use <polygon>`);
  }
  if (/stroke|gradient|filter|opacity|style=/i.test(source)) {
    fail('strokes, gradients, filters, opacity and inline styles are not allowed');
  }

  const polygons: Polygon[] = [];
  for (const match of source.matchAll(/<polygon\b[^>]*>/g)) {
    const element = match[0];
    const fill = /\bfill="(#[0-9a-f]{6})"/.exec(element)?.[1];
    if (fill === undefined) fail('every polygon needs a lower-case #rrggbb fill');
    if (!ALLOWED_FILLS.has(fill!)) fail(`fill ${fill} is not in the palette`);
    const text = /\bpoints="([^"]*)"/.exec(element)?.[1] ?? '';
    const points = text
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (points.length < 6 || points.length % 2 !== 0 || points.some((n) => !Number.isFinite(n))) {
      fail(`polygon points "${text}" must be at least three x,y pairs`);
    }
    polygons.push({ points, rgb: hexToRgb(fill!), team: TEAM_INDEX.get(fill!) ?? -1 });
  }
  if (polygons.length === 0) fail('sprite has no polygons');
  return { polygons };
}
