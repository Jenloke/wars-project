import type { RawTerrainDef } from '@tactics/engine';
import { AIR_MOVE_TYPES, LAND_MOVE_TYPES, NAVAL_MOVE_TYPES } from './moveTypes';
import { LAND_UNIT_IDS } from './units';

const AIR = { air: 1 };
const NAVAL = { sea: 1, lander: 1 };

/** Costs for terrain every land unit crosses at the same price. */
const PAVED = { foot: 1, mech: 1, tread: 1, tire: 1, ...AIR };

const LAND_REPAIRS: readonly string[] = LAND_MOVE_TYPES;
const NAVAL_REPAIRS: readonly string[] = NAVAL_MOVE_TYPES;
const AIR_REPAIRS: readonly string[] = AIR_MOVE_TYPES;

/**
 * Terrain in a fixed order: states and maps store terrain by index, so new
 * terrain is only ever appended.
 */
export const terrain: readonly RawTerrainDef[] = [
  {
    id: 'plains',
    name: 'Plains',
    defence: 1,
    moveCosts: { foot: 1, mech: 1, tread: 1, tire: 2, ...AIR },
  },
  { id: 'road', name: 'Road', defence: 0, moveCosts: PAVED },
  { id: 'bridge', name: 'Bridge', defence: 0, moveCosts: PAVED },
  {
    id: 'forest',
    name: 'Forest',
    defence: 2,
    moveCosts: { foot: 1, mech: 1, tread: 2, tire: 3, ...AIR },
  },
  {
    id: 'mountain',
    name: 'Mountain',
    defence: 4,
    moveCosts: { foot: 2, mech: 1, ...AIR },
  },
  {
    id: 'sea',
    name: 'Sea',
    defence: 0,
    moveCosts: { sea: 1, lander: 1, ...AIR },
  },
  {
    id: 'city',
    name: 'City',
    defence: 3,
    moveCosts: PAVED,
    property: { isHq: false, repairs: LAND_REPAIRS, builds: [] },
  },
  {
    id: 'base',
    name: 'Base',
    defence: 3,
    moveCosts: PAVED,
    property: { isHq: false, repairs: LAND_REPAIRS, builds: LAND_UNIT_IDS },
  },
  {
    id: 'hq',
    name: 'HQ',
    defence: 4,
    moveCosts: PAVED,
    property: { isHq: true, repairs: LAND_REPAIRS, builds: [] },
  },
  {
    // Beaches: the only open ground landers can reach, so where armies land.
    id: 'shoal',
    name: 'Shoal',
    defence: 0,
    moveCosts: { ...PAVED, lander: 1 },
  },
  {
    // Rocks in open water: slow for ships, but a little cover.
    id: 'reef',
    name: 'Reef',
    defence: 1,
    moveCosts: { sea: 2, lander: 2, ...AIR },
  },
  {
    id: 'port',
    name: 'Port',
    defence: 3,
    moveCosts: { ...PAVED, ...NAVAL },
    property: { isHq: false, repairs: NAVAL_REPAIRS, builds: [] },
  },
  {
    id: 'airport',
    name: 'Airport',
    defence: 3,
    moveCosts: PAVED,
    property: { isHq: false, repairs: AIR_REPAIRS, builds: [] },
  },
];
