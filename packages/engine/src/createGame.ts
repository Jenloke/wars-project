import type { CompiledRuleset } from './ruleset';
import {
  NO_OWNER,
  NO_UNIT,
  SCHEMA_VERSION,
  type ControllerKind,
  type GameState,
  type MapData,
  type Player,
  type Unit,
  type UnitId,
} from './types';

export interface PlayerSetup {
  readonly controller: ControllerKind;
  /** Commander ID. Defaults to the ruleset's no-op commander. */
  readonly commander?: string | undefined;
}

export interface GameSetup {
  readonly seed: number;
  /** One entry per map player slot, in slot order. */
  readonly players: readonly PlayerSetup[];
}

function requireIndex(index: ReadonlyMap<string, number>, id: string, kind: string): number {
  const value = index.get(id);
  if (value === undefined) throw new Error(`Map references unknown ${kind} "${id}"`);
  return value;
}

/** Builds the initial state of a game on `map`. Works for any map size. */
export function createGame(ruleset: CompiledRuleset, map: MapData, setup: GameSetup): GameState {
  const { width, height } = map;
  const tileCount = width * height;
  if (map.tiles.length !== tileCount) {
    throw new Error(`Map "${map.id}" has ${map.tiles.length} tiles, expected ${tileCount}`);
  }
  if (setup.players.length !== map.players.length) {
    throw new Error(`Map "${map.id}" needs ${map.players.length} players`);
  }

  const terrain = map.tiles.map((id) => requireIndex(ruleset.terrainIndex, id, 'terrain'));
  const owner = new Array<number>(tileCount).fill(NO_OWNER);
  const capture = new Array<number>(tileCount).fill(ruleset.rules.capturePoints);
  const occupant = new Array<number>(tileCount).fill(NO_UNIT);

  for (const property of map.properties) {
    const tile = property.y * width + property.x;
    if (!ruleset.terrain[terrain[tile]!]!.isProperty) {
      throw new Error(`Map "${map.id}" lists a property on non-property terrain at ${tile}`);
    }
    owner[tile] = property.owner ?? NO_OWNER;
  }

  const units: Record<UnitId, Unit> = {};
  let nextUnitId = 1;
  for (const placed of map.units) {
    const tile = placed.y * width + placed.x;
    if (occupant[tile] !== NO_UNIT) throw new Error(`Map "${map.id}" stacks units at ${tile}`);
    const type = requireIndex(ruleset.unitIndex, placed.type, 'unit');
    const def = ruleset.units[type]!;
    const id = nextUnitId++;
    units[id] = {
      id,
      type,
      owner: placed.owner,
      pos: tile,
      hp: placed.hp ?? ruleset.rules.maxHp,
      fuel: def.maxFuel,
      ammo: def.maxAmmo,
      moved: false,
      cargo: [],
      carrier: NO_UNIT,
    };
    occupant[tile] = id;
  }

  const players: Player[] = map.players.map((slot, i) => {
    const commanderId = setup.players[i]!.commander;
    const commander =
      commanderId === undefined
        ? 0
        : ruleset.commanders.findIndex((candidate) => candidate.id === commanderId);
    if (commander < 0) throw new Error(`Unknown commander "${commanderId}"`);
    return {
      funds: slot.startingFunds,
      commander,
      power: 0,
      controller: setup.players[i]!.controller,
      alive: true,
    };
  });

  // The first player's opening turn collects income like any other turn.
  let firstIncome = 0;
  for (let tile = 0; tile < tileCount; tile++) {
    if (owner[tile] === 0) firstIncome += map.rules.incomePerProperty;
  }
  players[0] = { ...players[0]!, funds: players[0]!.funds + firstIncome };

  return {
    schemaVersion: SCHEMA_VERSION,
    rulesetId: ruleset.id,
    mapId: map.id,
    width,
    height,
    terrain,
    owner,
    capture,
    occupant,
    units,
    nextUnitId,
    players,
    activePlayer: 0,
    day: 1,
    incomePerProperty: map.rules.incomePerProperty,
    rng: setup.seed >>> 0,
    status: { kind: 'playing' },
  };
}
