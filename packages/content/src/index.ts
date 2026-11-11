/** Public API of the content package. All data is validated once at import. */
import type { RawRuleset } from '@tactics/engine';
import { commanders } from './commanders';
import { damage } from './damage';
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

export { factions, type Faction } from './factions';
export { mapSchema, rulesetSchema } from './schemas';
