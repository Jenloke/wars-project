/** Public API of the content package. All data is validated once at import. */
import { MapRegistry } from './maps/registry';
import { twinFords } from './maps/twinFords';
import { ruleset } from './ruleset';

export { ruleset } from './ruleset';

export const maps = new MapRegistry(ruleset);
maps.register(twinFords);

export const DEFAULT_MAP_ID = twinFords.id;

export { factions, type Faction } from './factions';
export { MapRegistry, validateMap } from './maps/registry';
export {
  asciiToMap,
  defaultLegend,
  type AsciiLegend,
  type AsciiLegendEntry,
  type AsciiMapMeta,
} from './maps/ascii';
export { TWIN_FORDS_ASCII, twinFords } from './maps/twinFords';
export { mapSchema, rulesetSchema } from './schemas';
export {
  MASK_EAST,
  MASK_NORTH,
  MASK_SOUTH,
  MASK_WEST,
  terrainVisuals,
  unitSpriteId,
  type AutotileRule,
  type TerrainVisual,
} from './visuals';
export { actionSchema, readSave, saveSchema } from './saves';
