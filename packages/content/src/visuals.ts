/**
 * How content is drawn, as data. The renderer knows nothing about specific units
 * or terrain: it asks `unitVisual` and `terrainVisual`, which follow a naming
 * convention unless an entry below says otherwise. A new unit or building is
 * drawn as soon as its SVG exists under the conventional ID, and with a generic
 * placeholder until then, with no renderer change.
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
  readonly variants?: Readonly<Record<number, string>> | undefined;
}

export interface TerrainVisual {
  /** Sprite ID, or the prefix for autotiled sprites. Owned properties use team colours. */
  readonly sprite: string;
  /** Drawn when `sprite` has no art yet. */
  readonly fallback: string;
  readonly autotile?: AutotileRule | undefined;
  /** A second autotiled sprite drawn on top, such as coast edges on sea. */
  readonly overlay?: { readonly sprite: string; readonly autotile: AutotileRule } | undefined;
}

export interface UnitVisual {
  /** Sprite ID. Units are authored facing right; the renderer mirrors them. */
  readonly sprite: string;
  /** Drawn when `sprite` has no art yet, so a new unit is playable before it has any. */
  readonly fallback: string;
  /** Height above its tile, in sprite grid units (48 to a tile). Lifted units cast a shadow. */
  readonly lift: number;
}

/** Placeholder art for content that has none yet. */
export const FALLBACK_SPRITES = {
  unit: 'unit.unknown',
  building: 'building.unknown',
  terrain: 'terrain.unknown',
} as const;

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

/**
 * Terrain drawn other than by convention. By convention terrain `x` is sprite
 * `terrain.x`, and a property `x` is `building.x` in its owner's colours.
 */
export const terrainVisuals: Readonly<Record<string, Partial<TerrainVisual>>> = {
  road: { autotile: { connectsTo: ROAD_NETWORK } },
  bridge: { autotile: { connectsTo: ROAD_NETWORK, variants: bridgeVariants() } },
  sea: { overlay: { sprite: 'terrain.coast', autotile: { connectsTo: LAND } } },
};

/** How terrain `id` is drawn. `isProperty` picks the building convention. */
export function terrainVisual(id: string, isProperty: boolean): TerrainVisual {
  const kind = isProperty ? 'building' : 'terrain';
  return { sprite: `${kind}.${id}`, fallback: FALLBACK_SPRITES[kind], ...terrainVisuals[id] };
}

/** How high units of each move type are drawn above their tile. */
const LIFT_BY_MOVE_TYPE: Readonly<Record<string, number>> = { air: 5 };

/**
 * Units drawn other than by convention. By convention unit `x` is sprite
 * `unit.x`, lifted according to its move type.
 */
export const unitVisuals: Readonly<Record<string, Partial<UnitVisual>>> = {};

/** How a unit of type `id` with move type `moveType` is drawn. */
export function unitVisual(id: string, moveType: string): UnitVisual {
  return {
    sprite: `unit.${id}`,
    fallback: FALLBACK_SPRITES.unit,
    lift: LIFT_BY_MOVE_TYPE[moveType] ?? 0,
    ...unitVisuals[id],
  };
}
