import {
  applyAction,
  compileRuleset,
  createGame,
  type Action,
  type CompiledRuleset,
  type GameEvent,
  type GameState,
  type MapData,
  type RawRuleset,
  type TileIndex,
  type Unit,
} from '../src/index';

/**
 * A small self-contained ruleset. The engine must not import the content
 * package, and round numbers make expected values easy to compute by hand.
 */
export const testRuleset: RawRuleset = {
  id: 'test',
  moveTypes: ['foot', 'tread', 'tire'],
  units: [
    {
      id: 'infantry',
      name: 'Infantry',
      moveType: 'foot',
      movePoints: 3,
      cost: 1000,
      maxFuel: 99,
      maxAmmo: 0,
      minRange: 1,
      maxRange: 1,
      canCapture: true,
      canSupply: false,
    },
    {
      id: 'tank',
      name: 'Tank',
      moveType: 'tread',
      movePoints: 6,
      cost: 7000,
      maxFuel: 70,
      maxAmmo: 2,
      minRange: 1,
      maxRange: 1,
      canCapture: false,
      canSupply: false,
    },
    {
      id: 'artillery',
      name: 'Artillery',
      moveType: 'tread',
      movePoints: 5,
      cost: 6000,
      maxFuel: 50,
      maxAmmo: 9,
      minRange: 2,
      maxRange: 3,
      canCapture: false,
      canSupply: false,
    },
    {
      id: 'apc',
      name: 'APC',
      moveType: 'tread',
      movePoints: 6,
      cost: 5000,
      maxFuel: 70,
      maxAmmo: 0,
      minRange: 0,
      maxRange: 0,
      canCapture: false,
      canSupply: true,
      transport: { capacity: 1, carries: ['foot'] },
    },
  ],
  terrain: [
    { id: 'plains', name: 'Plains', defence: 1, moveCosts: { foot: 1, tread: 1, tire: 2 } },
    { id: 'road', name: 'Road', defence: 0, moveCosts: { foot: 1, tread: 1, tire: 1 } },
    { id: 'forest', name: 'Forest', defence: 2, moveCosts: { foot: 1, tread: 2, tire: 3 } },
    { id: 'mountain', name: 'Mountain', defence: 4, moveCosts: { foot: 2 } },
    { id: 'sea', name: 'Sea', defence: 0, moveCosts: {} },
    {
      id: 'city',
      name: 'City',
      defence: 3,
      moveCosts: { foot: 1, tread: 1, tire: 1 },
      property: { isHq: false, repairs: ['foot', 'tread', 'tire'], builds: [] },
    },
    {
      id: 'base',
      name: 'Base',
      defence: 3,
      moveCosts: { foot: 1, tread: 1, tire: 1 },
      property: {
        isHq: false,
        repairs: ['foot', 'tread', 'tire'],
        builds: ['infantry', 'tank', 'artillery', 'apc'],
      },
    },
    {
      id: 'hq',
      name: 'HQ',
      defence: 4,
      moveCosts: { foot: 1, tread: 1, tire: 1 },
      property: { isHq: true, repairs: ['foot', 'tread', 'tire'], builds: [] },
    },
  ],
  damage: [
    { attacker: 'infantry', defender: 'infantry', secondary: 50 },
    { attacker: 'infantry', defender: 'tank', secondary: 5 },
    { attacker: 'infantry', defender: 'artillery', secondary: 20 },
    { attacker: 'infantry', defender: 'apc', secondary: 20 },
    { attacker: 'tank', defender: 'infantry', secondary: 70 },
    { attacker: 'tank', defender: 'tank', primary: 60 },
    { attacker: 'tank', defender: 'artillery', primary: 70, secondary: 40 },
    { attacker: 'tank', defender: 'apc', primary: 70, secondary: 40 },
    { attacker: 'artillery', defender: 'infantry', primary: 90 },
    { attacker: 'artillery', defender: 'tank', primary: 70 },
    { attacker: 'artillery', defender: 'artillery', primary: 70 },
    { attacker: 'artillery', defender: 'apc', primary: 70 },
  ],
  commanders: [
    { id: 'none', name: 'None', modifiers: [] },
    {
      id: 'striker',
      name: 'Striker',
      modifiers: [
        { hook: 'attack', value: 20 },
        { hook: 'movement', units: ['infantry'], value: 1 },
        { hook: 'cost', units: ['tank'], value: -10 },
      ],
    },
  ],
  rules: { maxHp: 100, hpPerPip: 10, capturePoints: 20, repairHp: 20, luckMax: 9 },
};

export const rules: CompiledRuleset = compileRuleset(testRuleset);

const LEGEND: Record<string, { terrain: string; owner?: number | null }> = {
  '.': { terrain: 'plains' },
  '=': { terrain: 'road' },
  F: { terrain: 'forest' },
  M: { terrain: 'mountain' },
  '~': { terrain: 'sea' },
  C: { terrain: 'city', owner: null },
  c: { terrain: 'city', owner: 0 },
  H: { terrain: 'hq', owner: 0 },
  R: { terrain: 'base', owner: 0 },
  h: { terrain: 'hq', owner: 1 },
  b: { terrain: 'base', owner: 1 },
};

export interface PlacedUnit {
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly owner: number;
  readonly hp?: number;
}

export function makeMap(rows: readonly string[], units: readonly PlacedUnit[] = []): MapData {
  const width = rows[0]!.length;
  const tiles: string[] = [];
  const properties: { x: number; y: number; owner: number | null }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const entry = LEGEND[row[x]!]!;
      tiles.push(entry.terrain);
      if (entry.owner !== undefined) properties.push({ x, y, owner: entry.owner });
    }
  });
  return {
    formatVersion: 1,
    id: 'test',
    name: 'Test',
    author: 'test',
    width,
    height: rows.length,
    tiles,
    properties,
    units,
    players: [
      { slot: 0, startingFunds: 0 },
      { slot: 1, startingFunds: 0 },
    ],
    rules: { incomePerProperty: 1000 },
  };
}

export function makeGame(
  rows: readonly string[],
  units: readonly PlacedUnit[] = [],
  seed = 1,
  ruleset: CompiledRuleset = rules,
): GameState {
  return createGame(ruleset, makeMap(rows, units), {
    seed,
    players: [{ controller: 'local' }, { controller: 'local' }],
  });
}

/** Tile index on a state from x, y. */
export function at(state: GameState, x: number, y: number): TileIndex {
  return y * state.width + x;
}

export function unitAt(state: GameState, x: number, y: number): Unit {
  const id = state.occupant[at(state, x, y)]!;
  const unit = state.units[id];
  if (unit === undefined) throw new Error(`No unit at (${x},${y})`);
  return unit;
}

export interface Applied {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Applies an action that is expected to be legal. */
export function apply(state: GameState, action: Action, ruleset = rules): Applied {
  const result = applyAction(ruleset, state, action);
  if (!result.ok) throw new Error(`Expected a legal action: ${result.error}`);
  return result;
}

/** Applies an action that is expected to be rejected and returns the error. */
export function reject(state: GameState, action: Action, ruleset = rules): string {
  const result = applyAction(ruleset, state, action);
  if (result.ok) throw new Error('Expected the action to be rejected');
  return result.error;
}

/** Returns a copy of the state with one unit's fields overridden. */
export function withUnit(state: GameState, id: number, patch: Partial<Unit>): GameState {
  return { ...state, units: { ...state.units, [id]: { ...state.units[id]!, ...patch } } };
}

/** Map for the scripted game: a base and HQ each, with a neutral city between. */
export const SCRIPT_ROWS: readonly string[] = ['R==C==b', 'H=====h'];

/** A short game on `SCRIPT_ROWS` that builds, moves, fights and captures. */
export function scriptedActions(): Action[] {
  const infantry = rules.unitIndex.get('infantry')!;
  return [
    { type: 'Build', at: 0, unitType: infantry }, // unit 1
    { type: 'EndTurn' },
    { type: 'Build', at: 6, unitType: infantry }, // unit 2
    { type: 'EndTurn' },
    { type: 'Capture', unit: 1, path: [1, 2, 3] },
    { type: 'Build', at: 0, unitType: infantry }, // unit 3
    { type: 'EndTurn' },
    { type: 'Attack', unit: 2, path: [5, 4], target: 3 },
    { type: 'EndTurn' },
    { type: 'Attack', unit: 1, path: [], target: 4 },
    { type: 'Move', unit: 3, path: [1, 2] },
    { type: 'EndTurn' },
  ];
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
