/** Public API of the content package. All data is validated once at import. */
import type { RawRuleset } from '@tactics/engine';
import { commanders } from './commanders';
import { damage } from './damage';
import { MapRegistry } from './maps/registry';
import { twinFords } from './maps/twinFords';
import { moveTypes } from './moveTypes';
import { rulesetSchema } from './schemas';
import { terrain } from './terrain';
import { units } from './units';

export const ruleset: RawRuleset = rulesetSchema.parse({
  id: 'core-1',
  moveTypes,
  units,
  terrain,
  damage,
  commanders,
  rules: {
    maxHp: 100,
    hpPerPip: 10,
    capturePoints: 20,
    repairHp: 20,
    luckMax: 9,
  },
});

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
