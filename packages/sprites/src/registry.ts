import atlas from '../dist/atlas.json';

/** Size of one sprite cell in atlas pixels at 1x. */
export const CELL: number = atlas.cell;

/** Vertical distance, in 1x pixels, between the same sprite in adjacent team ramps. */
export const TEAM_STRIDE: number = atlas.teamStride * atlas.cell;

export type AtlasScale = 1 | 2;

/**
 * Where a sprite lives in the atlas, in 1x pixels. Frame `f` of team variant `v`
 * is the cell at `(x + f * CELL, y + (team ? v * TEAM_STRIDE : 0))`; multiply by
 * the atlas scale for the source rectangle.
 */
export interface SpriteRef {
  readonly x: number;
  readonly y: number;
  readonly frames: number;
  readonly team: boolean;
}

const sprites = new Map<string, SpriteRef>();
for (const [id, place] of Object.entries(atlas.sprites)) {
  sprites.set(id, {
    x: place.col * atlas.cell,
    y: place.row * atlas.cell,
    frames: place.frames,
    team: place.team,
  });
}

/** Looks up a sprite by ID, or undefined if the art does not exist. */
export function findSprite(id: string): SpriteRef | undefined {
  return sprites.get(id);
}

/** Looks up a sprite by ID. Throws if it is missing, which is an art bug. */
export function getSprite(id: string): SpriteRef {
  const sprite = sprites.get(id);
  if (sprite === undefined) throw new Error(`Missing sprite "${id}"`);
  return sprite;
}

export function listSpriteIds(): string[] {
  return [...sprites.keys()];
}

const ATLAS_URLS: Readonly<Record<AtlasScale, string>> = {
  1: new URL('../dist/atlas@1x.png', import.meta.url).href,
  2: new URL('../dist/atlas@2x.png', import.meta.url).href,
};

/** Loads the atlas image for a scale. */
export function loadAtlas(scale: AtlasScale): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load the ${scale}x sprite atlas`));
    image.src = ATLAS_URLS[scale];
  });
}
