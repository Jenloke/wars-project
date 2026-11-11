/**
 * Builds the sprite atlas from the SVG sources.
 *
 *   src/svg/<group>/<name>.svg          -> sprite "<group>.<name>"
 *   src/svg/<group>/<name>.f<N>.svg     -> frame N of sprite "<group>.<name>"
 *
 * Output (in dist/): atlas@1x.png, atlas@2x.png and atlas.json. Sprites that use
 * the team placeholder colours are emitted once per team ramp, each ramp on its
 * own band of rows; all other sprites are emitted once.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { palette, TEAM_PLACEHOLDERS, TEAM_RAMPS } from '../src/palette';

const CELL = 48;
const COLUMNS = 24;
const SCALES = [1, 2] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgRoot = join(root, 'src', 'svg');
const outDir = join(root, 'dist');

interface Sprite {
  readonly id: string;
  /** SVG source per frame. */
  readonly frames: string[];
  readonly team: boolean;
}

interface Placement {
  readonly col: number;
  readonly row: number;
  readonly frames: number;
  readonly team: boolean;
}

const ALLOWED_FILLS = new Set<string>([...Object.values(palette), ...TEAM_PLACEHOLDERS]);

/** Enforces the art rules: polygons only, flat palette fills, 48x48 grid. */
function lint(file: string, svg: string): void {
  const fail = (reason: string): never => {
    throw new Error(`${file}: ${reason}`);
  };
  if (!/viewBox="0 0 48 48"/.test(svg)) fail('viewBox must be "0 0 48 48"');
  for (const match of svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) {
    const tag = match[1]!;
    if (tag !== 'svg' && tag !== 'polygon') fail(`<${tag}> is not allowed, use <polygon>`);
  }
  if (/stroke|gradient|filter|opacity|style=/i.test(svg)) {
    fail('strokes, gradients, filters, opacity and inline styles are not allowed');
  }
  const polygons = [...svg.matchAll(/<polygon\b[^>]*>/g)];
  if (polygons.length === 0) fail('sprite has no polygons');
  for (const polygon of polygons) {
    const fill = /fill="(#[0-9a-f]{6})"/.exec(polygon[0])?.[1];
    if (fill === undefined) fail('every polygon needs a lower-case #rrggbb fill');
    else if (!ALLOWED_FILLS.has(fill)) fail(`fill ${fill} is not in the palette`);
  }
}

function loadSprites(): Sprite[] {
  const byId = new Map<string, { frames: Map<number, string>; team: boolean }>();
  for (const group of readdirSync(svgRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const file of readdirSync(join(svgRoot, group.name))) {
      if (!file.endsWith('.svg')) continue;
      const path = join(svgRoot, group.name, file);
      const svg = readFileSync(path, 'utf8');
      lint(`${group.name}/${file}`, svg);

      const stem = file.slice(0, -'.svg'.length);
      const frameMatch = /^(.*)\.f(\d+)$/.exec(stem);
      const id = `${group.name}.${frameMatch ? frameMatch[1]! : stem}`;
      const frame = frameMatch ? Number(frameMatch[2]) : 0;

      const entry = byId.get(id) ?? { frames: new Map<number, string>(), team: false };
      entry.frames.set(frame, svg);
      entry.team ||= TEAM_PLACEHOLDERS.some((colour) => svg.includes(colour));
      byId.set(id, entry);
    }
  }

  const sprites: Sprite[] = [];
  for (const [id, entry] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    const frames: string[] = [];
    for (let i = 0; i < entry.frames.size; i++) {
      const svg = entry.frames.get(i);
      if (svg === undefined) throw new Error(`${id}: frames must be numbered from f0 without gaps`);
      frames.push(svg);
    }
    sprites.push({ id, frames, team: entry.team });
  }
  return sprites;
}

/** Packs sprites into rows, keeping each sprite's frames together on one row. */
function pack(sprites: readonly Sprite[], firstRow: number) {
  const placements = new Map<string, Placement>();
  let col = 0;
  let row = firstRow;
  for (const sprite of sprites) {
    const frames = sprite.frames.length;
    if (frames > COLUMNS) throw new Error(`${sprite.id}: too many frames for one row`);
    if (col + frames > COLUMNS) {
      col = 0;
      row++;
    }
    placements.set(sprite.id, { col, row, frames, team: sprite.team });
    col += frames;
  }
  const rows = sprites.length === 0 ? 0 : row - firstRow + 1;
  return { placements, rows };
}

function recolour(svg: string, ramp: readonly string[]): string {
  let out = svg;
  TEAM_PLACEHOLDERS.forEach((placeholder, i) => {
    out = out.replaceAll(placeholder, ramp[i]!);
  });
  return out;
}

function blit(target: PNG, svg: string, cellX: number, cellY: number, scale: number): void {
  const size = CELL * scale;
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    shapeRendering: 1, // crispEdges: hard polygon edges, no anti-aliasing
  }).render();
  if (rendered.width !== size || rendered.height !== size) {
    throw new Error(`Rendered ${rendered.width}x${rendered.height}, expected ${size}x${size}`);
  }
  const source = rendered.pixels;
  const rowBytes = size * 4;
  for (let y = 0; y < size; y++) {
    const from = y * rowBytes;
    const to = ((cellY * size + y) * target.width + cellX * size) * 4;
    target.data.set(source.subarray(from, from + rowBytes), to);
  }
}

function main(): void {
  const sprites = loadSprites();
  const plain = sprites.filter((sprite) => !sprite.team);
  const team = sprites.filter((sprite) => sprite.team);

  const plainPack = pack(plain, 0);
  const teamPack = pack(team, plainPack.rows);
  const teamStride = teamPack.rows;
  const rows = plainPack.rows + teamStride * TEAM_RAMPS.length;

  mkdirSync(outDir, { recursive: true });
  for (const scale of SCALES) {
    const png = new PNG({ width: COLUMNS * CELL * scale, height: rows * CELL * scale });
    for (const sprite of plain) {
      const place = plainPack.placements.get(sprite.id)!;
      sprite.frames.forEach((svg, f) => blit(png, svg, place.col + f, place.row, scale));
    }
    TEAM_RAMPS.forEach((ramp, variant) => {
      for (const sprite of team) {
        const place = teamPack.placements.get(sprite.id)!;
        sprite.frames.forEach((svg, f) =>
          blit(png, recolour(svg, ramp), place.col + f, place.row + variant * teamStride, scale),
        );
      }
    });
    writeFileSync(join(outDir, `atlas@${scale}x.png`), PNG.sync.write(png));
  }

  const frameMap: Record<string, Placement> = {};
  for (const [id, place] of [...plainPack.placements, ...teamPack.placements]) {
    frameMap[id] = place;
  }
  const manifest = {
    cell: CELL,
    columns: COLUMNS,
    rows,
    teamStride,
    variants: TEAM_RAMPS.length,
    sprites: frameMap,
  };
  writeFileSync(join(outDir, 'atlas.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `Atlas: ${sprites.length} sprites (${team.length} team-coloured x ${TEAM_RAMPS.length} ramps), ` +
      `${COLUMNS}x${rows} cells`,
  );
}

main();
