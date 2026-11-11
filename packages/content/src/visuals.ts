/**
 * How content is drawn, as data. The renderer knows nothing about specific
 * terrain: it reads these records, so a new terrain type opts into autotiling
 * here without renderer changes.
 */

/** Neighbour mask bits used by autotiling. */
export const MASK_NORTH = 1;
export const MASK_EAST = 2;
export const MASK_SOUTH = 4;
export const MASK_WEST = 8;

export interface AutotileRule {
  /** Terrain IDs that count as a connection. */
  readonly connectsTo: readonly string[];
  /**
   * Sprite ID per 4-bit neighbour mask. When omitted the sprite is
   * `<sprite>.<mask>`. A mask with no entry draws nothing.
   */
  readonly variants?: Readonly<Record<number, string>>;
}

export interface TerrainVisual {
  /** Sprite ID, or the prefix for autotiled sprites. */
  readonly sprite: string;
  /** True if the sprite is recoloured per owner. */
  readonly team?: boolean;
  readonly autotile?: AutotileRule;
  /** A second autotiled sprite drawn on top, such as coast edges on sea. */
  readonly overlay?: { readonly sprite: string; readonly autotile: AutotileRule };
}

const ROAD_NETWORK = ['road', 'bridge', 'city', 'base', 'hq'];
const LAND = ['plains', 'road', 'forest', 'mountain', 'city', 'base', 'hq'];

/** A bridge runs north-south only when it has no east or west connection. */
function bridgeVariants(): Record<number, string> {
  const variants: Record<number, string> = {};
  for (let mask = 0; mask < 16; mask++) {
    const horizontal = (mask & (MASK_EAST | MASK_WEST)) !== 0 || mask === 0;
    variants[mask] = horizontal ? 'terrain.bridge.h' : 'terrain.bridge.v';
  }
  return variants;
}

export const terrainVisuals: Readonly<Record<string, TerrainVisual>> = {
  plains: { sprite: 'terrain.plains' },
  forest: { sprite: 'terrain.forest' },
  mountain: { sprite: 'terrain.mountain' },
  road: { sprite: 'terrain.road', autotile: { connectsTo: ROAD_NETWORK } },
  bridge: {
    sprite: 'terrain.bridge',
    autotile: { connectsTo: ROAD_NETWORK, variants: bridgeVariants() },
  },
  sea: {
    sprite: 'terrain.sea',
    overlay: { sprite: 'terrain.coast', autotile: { connectsTo: LAND } },
  },
  city: { sprite: 'building.city', team: true },
  base: { sprite: 'building.base', team: true },
  hq: { sprite: 'building.hq', team: true },
};

/** Sprite ID for a unit type. */
export function unitSpriteId(unitId: string): string {
  return `unit.${unitId}`;
}
