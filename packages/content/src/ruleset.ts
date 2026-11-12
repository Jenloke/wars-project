import type { RawRuleset } from '@tactics/engine';
import { commanders } from './commanders';
import { damage } from './damage';
import { moveTypes } from './moveTypes';
import { rulesetSchema } from './schemas';
import { terrain } from './terrain';
import { units } from './units';

/**
 * The game's rules, validated once at import. Change `id` whenever a change here
 * alters the outcome of an existing action log (see docs/COMMITS.md), since saves
 * and replays are only valid under the ruleset they were played with.
 */
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
