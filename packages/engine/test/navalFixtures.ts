import {
  compileRuleset,
  type CompiledRuleset,
  type RawRuleset,
  type RawTerrainDef,
  type RawUnitDef,
} from '../src/index';
import { testRuleset } from './fixtures';

/**
 * The test ruleset with aircraft and ships added: what the air and naval rules
 * need, and nothing more. Land rules are unchanged, so the land tests' numbers
 * hold here too.
 */

const LAND = ['foot', 'tread', 'tire'];
const AIR = { air: 1 };
const SEA = { sea: 1, lander: 1 };

function landCosts(cost: number): Record<string, number> {
  return Object.fromEntries(LAND.map((moveType) => [moveType, cost]));
}

const extraUnits: RawUnitDef[] = [
  {
    id: 'copter',
    name: 'Copter',
    moveType: 'air',
    tags: ['copter'],
    movePoints: 6,
    cost: 9000,
    maxFuel: 30,
    maxAmmo: 0,
    minRange: 1,
    maxRange: 1,
    canCapture: false,
    canSupply: false,
    fuelPerDay: 2,
    lostWithoutFuel: true,
    ignoresTerrainDefence: true,
  },
  {
    id: 'fighter',
    name: 'Fighter',
    moveType: 'air',
    tags: ['plane'],
    movePoints: 9,
    cost: 20000,
    maxFuel: 40,
    maxAmmo: 6,
    minRange: 1,
    maxRange: 1,
    canCapture: false,
    canSupply: false,
    fuelPerDay: 5,
    lostWithoutFuel: true,
    ignoresTerrainDefence: true,
  },
  {
    id: 'carrier',
    name: 'Carrier',
    moveType: 'sea',
    tags: ['ship'],
    movePoints: 5,
    cost: 16000,
    maxFuel: 50,
    maxAmmo: 0,
    minRange: 0,
    maxRange: 0,
    canCapture: false,
    canSupply: false,
    fuelPerDay: 1,
    lostWithoutFuel: true,
    transport: { capacity: 2, carries: ['copter'] },
  },
  {
    id: 'lander',
    name: 'Lander',
    moveType: 'lander',
    tags: ['ship'],
    movePoints: 6,
    cost: 12000,
    maxFuel: 50,
    maxAmmo: 0,
    minRange: 0,
    maxRange: 0,
    canCapture: false,
    canSupply: false,
    fuelPerDay: 1,
    lostWithoutFuel: true,
    transport: { capacity: 2, carries: ['foot', 'tread'] },
  },
];

function withAirAndSea(terrain: RawTerrainDef): RawTerrainDef {
  if (terrain.id === 'sea') return { ...terrain, moveCosts: { ...SEA, ...AIR } };
  return { ...terrain, moveCosts: { ...terrain.moveCosts, ...AIR } };
}

const extraTerrain: RawTerrainDef[] = [
  { id: 'shoal', name: 'Shoal', defence: 0, moveCosts: { ...landCosts(1), lander: 1, ...AIR } },
  { id: 'reef', name: 'Reef', defence: 1, moveCosts: { sea: 2, lander: 2, ...AIR } },
  {
    id: 'airport',
    name: 'Airport',
    defence: 3,
    moveCosts: { ...landCosts(1), ...AIR },
    property: { isHq: false, repairs: ['air'], builds: ['copter', 'fighter'] },
  },
  {
    id: 'port',
    name: 'Port',
    defence: 3,
    moveCosts: { ...landCosts(1), ...SEA, ...AIR },
    property: { isHq: false, repairs: ['sea', 'lander'], builds: ['carrier', 'lander'] },
  },
];

export const navalRuleset: RawRuleset = {
  ...testRuleset,
  id: 'test-naval',
  moveTypes: [...testRuleset.moveTypes, 'air', 'sea', 'lander'],
  units: [...testRuleset.units, ...extraUnits],
  terrain: [...testRuleset.terrain.map(withAirAndSea), ...extraTerrain],
  damage: [
    ...testRuleset.damage,
    { attacker: 'fighter', defender: 'copter', primary: 100 },
    { attacker: 'fighter', defender: 'fighter', primary: 55 },
    { attacker: 'tank', defender: 'copter', secondary: 10 },
  ],
};

export const navalRules: CompiledRuleset = compileRuleset(navalRuleset);
