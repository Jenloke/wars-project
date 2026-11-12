import {
  MASK_EAST,
  MASK_NORTH,
  MASK_SOUTH,
  MASK_WEST,
  terrainVisuals,
  type AutotileRule,
} from '@tactics/content';
import { NO_OWNER, type CompiledRuleset, type GameState } from '@tactics/engine';
import {
  CELL,
  findSprite,
  getSprite,
  NEUTRAL_VARIANT,
  TEAM_STRIDE,
  type AtlasScale,
  type SpriteRef,
} from '@tactics/sprites';

interface Autotile {
  /** Per terrain index: 1 if a neighbour of that terrain counts as connected. */
  readonly connects: Uint8Array;
  /** Sprite per 4-bit neighbour mask; undefined draws nothing. */
  readonly variants: readonly (SpriteRef | undefined)[];
}

interface TerrainSprite {
  readonly base: SpriteRef | undefined;
  readonly team: boolean;
  readonly autotile: Autotile | undefined;
  readonly overlay: Autotile | undefined;
}

function compileAutotile(ruleset: CompiledRuleset, sprite: string, rule: AutotileRule): Autotile {
  const connects = new Uint8Array(ruleset.terrainCount);
  for (const id of rule.connectsTo) {
    const index = ruleset.terrainIndex.get(id);
    if (index !== undefined) connects[index] = 1;
  }
  const variants: (SpriteRef | undefined)[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const id = rule.variants === undefined ? `${sprite}.${mask}` : rule.variants[mask];
    variants.push(id === undefined ? undefined : findSprite(id));
  }
  return { connects, variants };
}

/** Resolves the content's visual data to sprite references, once per ruleset. */
export function compileTerrainSprites(ruleset: CompiledRuleset): TerrainSprite[] {
  return ruleset.terrain.map((terrain) => {
    const visual = terrainVisuals[terrain.id];
    if (visual === undefined) throw new Error(`Terrain "${terrain.id}" has no visual`);
    const autotile = visual.autotile && compileAutotile(ruleset, visual.sprite, visual.autotile);
    return {
      base: autotile ? undefined : getSprite(visual.sprite),
      team: visual.team ?? false,
      autotile,
      overlay:
        visual.overlay && compileAutotile(ruleset, visual.overlay.sprite, visual.overlay.autotile),
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

/**
 * Draws all terrain and buildings of `state` into a new canvas at the atlas scale.
 * This is the expensive part of a frame, so the renderer keeps the result and only
 * rebuilds when the terrain or ownership arrays change.
 */
export function buildTerrainLayer(
  state: GameState,
  sprites: readonly TerrainSprite[],
  atlas: CanvasImageSource,
  scale: AtlasScale,
): HTMLCanvasElement {
  const size = CELL * scale;
  const canvas = document.createElement('canvas');
  canvas.width = state.width * size;
  canvas.height = state.height * size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingEnabled = false;

  const draw = (sprite: SpriteRef, variant: number, tile: number) => {
    const sy = sprite.y + (sprite.team ? variant * TEAM_STRIDE : 0);
    ctx.drawImage(
      atlas,
      sprite.x * scale,
      sy * scale,
      size,
      size,
      (tile % state.width) * size,
      ((tile / state.width) | 0) * size,
      size,
      size,
    );
  };

  for (let tile = 0; tile < state.terrain.length; tile++) {
    const visual = sprites[state.terrain[tile]!]!;
    const owner = state.owner[tile]!;
    const variant = owner === NO_OWNER ? NEUTRAL_VARIANT : owner;

    const sprite = visual.autotile
      ? visual.autotile.variants[neighbourMask(state, tile, visual.autotile.connects)]
      : visual.base;
    if (sprite !== undefined) draw(sprite, variant, tile);

    if (visual.overlay) {
      const overlay = visual.overlay.variants[neighbourMask(state, tile, visual.overlay.connects)];
      if (overlay !== undefined) draw(overlay, variant, tile);
    }
  }
  return canvas;
}
