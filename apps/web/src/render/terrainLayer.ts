import {
  MASK_EAST,
  MASK_NORTH,
  MASK_SOUTH,
  MASK_WEST,
  terrainVisual,
  type AutotileRule,
} from '@tactics/content';
import { NO_OWNER, type CompiledRuleset, type GameState } from '@tactics/engine';
import type { Sprite, SpriteLibrary } from '@tactics/sprites';
import type { SpriteCache } from './spriteCache';

interface Autotile {
  /** Per terrain index: 1 if a neighbour of that terrain counts as connected. */
  readonly connects: Uint8Array;
  /** Sprite per 4-bit neighbour mask; undefined draws nothing. */
  readonly variants: readonly (Sprite | undefined)[];
}

/** How one terrain type is drawn, with its sprites resolved. */
export interface TerrainLook {
  /** Drawn when the terrain does not autotile. */
  readonly base: Sprite | undefined;
  readonly autotile: Autotile | undefined;
  readonly overlay: Autotile | undefined;
}

function compileAutotile(
  ruleset: CompiledRuleset,
  library: SpriteLibrary,
  sprite: string,
  rule: AutotileRule,
): Autotile {
  const connects = new Uint8Array(ruleset.terrainCount);
  for (const id of rule.connectsTo) {
    const index = ruleset.terrainIndex.get(id);
    if (index !== undefined) connects[index] = 1;
  }
  const variants: (Sprite | undefined)[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const id = rule.variants === undefined ? `${sprite}.${mask}` : rule.variants[mask];
    variants.push(id === undefined ? undefined : library.find(id));
  }
  return { connects, variants };
}

/** Resolves the content's visual data to sprites, once per ruleset. */
export function compileTerrainLooks(
  ruleset: CompiledRuleset,
  library: SpriteLibrary,
): TerrainLook[] {
  return ruleset.terrain.map((terrain) => {
    const visual = terrainVisual(terrain.id, terrain.isProperty);
    let autotile =
      visual.autotile && compileAutotile(ruleset, library, visual.sprite, visual.autotile);
    // Autotiled terrain with no art at all yet falls back like any other.
    if (autotile?.variants.every((variant) => variant === undefined)) autotile = undefined;
    return {
      base: autotile ? undefined : library.resolve([visual.sprite, visual.fallback]),
      autotile,
      overlay:
        visual.overlay &&
        compileAutotile(ruleset, library, visual.overlay.sprite, visual.overlay.autotile),
    };
  });
}

/** Generic autotiling: which of the four neighbours connect, as a bit mask. */
function neighbourMask(state: GameState, tile: number, connects: Uint8Array): number {
  const { width, height, terrain } = state;
  const x = tile % width;
  const y = (tile / width) | 0;
  let mask = 0;
  if (y > 0 && connects[terrain[tile - width]!] === 1) mask |= MASK_NORTH;
  if (x < width - 1 && connects[terrain[tile + 1]!] === 1) mask |= MASK_EAST;
  if (y < height - 1 && connects[terrain[tile + width]!] === 1) mask |= MASK_SOUTH;
  if (x > 0 && connects[terrain[tile - 1]!] === 1) mask |= MASK_WEST;
  return mask;
}

/** The sprites on every tile, worked out once per terrain and ownership change. */
export interface TerrainPlan {
  readonly width: number;
  readonly base: readonly (Sprite | undefined)[];
  readonly overlay: readonly (Sprite | undefined)[];
  /** Per tile: owner whose colours a building is drawn in, `NO_OWNER` for neutral. */
  readonly owner: readonly number[];
}

export function planTerrain(state: GameState, looks: readonly TerrainLook[]): TerrainPlan {
  const count = state.terrain.length;
  const base: (Sprite | undefined)[] = new Array<Sprite | undefined>(count);
  const overlay: (Sprite | undefined)[] = new Array<Sprite | undefined>(count);
  for (let tile = 0; tile < count; tile++) {
    const look = looks[state.terrain[tile]!]!;
    base[tile] = look.autotile
      ? look.autotile.variants[neighbourMask(state, tile, look.autotile.connects)]
      : look.base;
    overlay[tile] = look.overlay?.variants[neighbourMask(state, tile, look.overlay.connects)];
  }
  return { width: state.width, base, overlay, owner: state.owner };
}

/**
 * Draws the tiles in columns `x0..x1` and rows `y0..y1` of `plan`, with the
 * map's top-left corner at `(originX, originY)` and tiles `cache.tileSize` wide.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  plan: TerrainPlan,
  cache: SpriteCache,
  bounds: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  originX: number,
  originY: number,
): void {
  const tile = cache.tileSize;
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      const at = y * plan.width + x;
      const owner = plan.owner[at] ?? NO_OWNER;
      const px = originX + x * tile;
      const py = originY + y * tile;
      const base = plan.base[at];
      if (base !== undefined) ctx.drawImage(cache.get(base, 0, owner), px, py);
      const overlay = plan.overlay[at];
      if (overlay !== undefined) ctx.drawImage(cache.get(overlay, 0, owner), px, py);
    }
  }
}
