import { compileRuleset, createGame, NO_DAMAGE } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import {
  asciiToMap,
  maps,
  MapRegistry,
  ruleset,
  terrainVisual,
  TERN_REACH_ASCII,
  ternReach,
  unitVisual,
  TWIN_FORDS_ASCII,
  twinFords,
  validateMap,
} from '../src/index';

const compiled = compileRuleset(ruleset);

describe('ruleset', () => {
  it('compiles without dangling references', () => {
    expect(compiled.unitCount).toBe(18);
    expect(compiled.moveTypes).toEqual(['foot', 'mech', 'tread', 'tire', 'air', 'sea', 'lander']);
  });

  const canHit = (attacker: number, defender: number) => {
    const cell = attacker * compiled.unitCount + defender;
    return (
      compiled.primaryDamage[cell] !== NO_DAMAGE || compiled.secondaryDamage[cell] !== NO_DAMAGE
    );
  };
  const unitsTagged = (tag: string) =>
    compiled.units.flatMap((unit, type) => (unit.tags.includes(tag) ? [type] : []));

  it('gives every armed unit a target, and leaves no unit invulnerable', () => {
    const types = compiled.units.map((_unit, type) => type);
    for (const attacker of types) {
      const armed = compiled.units[attacker]!.maxRange > 0;
      expect(types.some((defender) => canHit(attacker, defender))).toBe(armed);
      expect(types.some((other) => canHit(other, attacker))).toBe(true);
    }
  });

  it('lets every armed ground unit except missiles hit every other ground unit', () => {
    const ground = unitsTagged('ground');
    for (const attacker of ground) {
      const unit = compiled.units[attacker]!;
      if (unit.maxRange === 0 || unit.id === 'missiles') continue;
      for (const defender of ground) expect(canHit(attacker, defender)).toBe(true);
    }
  });

  it('builds ground units at bases, ships at ports and aircraft at airports', () => {
    const builds = (terrain: string) =>
      compiled.terrain[compiled.terrainIndex.get(terrain)!]!.builds.map(
        (type) => compiled.units[type]!.id,
      );
    expect(builds('base')).toHaveLength(10);
    expect(builds('port')).toEqual(['lander', 'cruiser', 'submarine', 'battleship']);
    expect(builds('airport')).toEqual(['transportCopter', 'battleCopter', 'fighter', 'bomber']);
  });

  it('lets cruisers carry copters but not planes, and landers carry any ground unit', () => {
    const carried = (transport: string) => {
      const def = compiled.units[compiled.unitIndex.get(transport)!]!;
      return compiled.units.filter((_unit, type) => def.carries[type] === 1).map((unit) => unit.id);
    };
    expect(carried('cruiser')).toEqual(['transportCopter', 'battleCopter']);
    expect(carried('lander')).toHaveLength(10);
    expect(carried('transportCopter')).toEqual(['infantry', 'mech']);
  });

  it('gives aircraft no terrain cover and makes every aircraft burn fuel', () => {
    for (const type of unitsTagged('air')) {
      const unit = compiled.units[type]!;
      expect(unit.ignoresTerrainDefence).toBe(true);
      expect(unit.fuelPerDay).toBeGreaterThan(0);
      expect(unit.lostWithoutFuel).toBe(true);
    }
  });

  it('lets only cruisers and submarines reach a dived submarine', () => {
    const sub = compiled.units[compiled.unitIndex.get('submarine')!]!;
    const hunters = compiled.units.filter((_unit, type) => sub.divedAttackers[type] === 1);
    expect(hunters.map((unit) => unit.id)).toEqual(['cruiser', 'submarine']);
  });

  it('only lets a property build units that can stand on it', () => {
    for (const terrain of compiled.terrain) {
      for (const unitType of terrain.builds) {
        const moveType = compiled.units[unitType]!.moveType;
        const index = compiled.terrainIndex.get(terrain.id)!;
        expect(compiled.moveCost[moveType * compiled.terrainCount + index]).toBeLessThan(255);
      }
    }
  });

  it('repairs naval units in ports and aircraft at airports', () => {
    const repairs = (terrain: string) => {
      const def = compiled.terrain[compiled.terrainIndex.get(terrain)!]!;
      return compiled.moveTypes.filter((_moveType, i) => def.repairs[i] === 1);
    };
    expect(repairs('port')).toEqual(['sea', 'lander']);
    expect(repairs('airport')).toEqual(['air']);
    expect(repairs('city')).toEqual(['foot', 'mech', 'tread', 'tire']);
  });

  it('only gives primary weapons to units that carry ammo', () => {
    for (let attacker = 0; attacker < compiled.unitCount; attacker++) {
      const row = compiled.primaryDamage.subarray(
        attacker * compiled.unitCount,
        (attacker + 1) * compiled.unitCount,
      );
      const hasPrimary = row.some((value) => value !== NO_DAMAGE);
      if (hasPrimary) expect(compiled.units[attacker]!.maxAmmo).toBeGreaterThan(0);
    }
  });

  it('draws terrain and units by convention unless a visual says otherwise', () => {
    expect(terrainVisual('forest', false)).toEqual({
      sprite: 'terrain.forest',
      fallback: 'terrain.unknown',
    });
    expect(terrainVisual('city', true)).toMatchObject({ sprite: 'building.city' });
    expect(terrainVisual('sea', false).overlay?.sprite).toBe('terrain.coast');
    expect(terrainVisual('road', false).autotile?.connectsTo).toContain('bridge');
    expect(unitVisual('tank', 'tread')).toEqual({
      sprite: 'unit.tank',
      fallback: 'unit.unknown',
      lift: 0,
    });
    expect(unitVisual('anything', 'air').lift).toBeGreaterThan(0);
  });
});

describe('ASCII converter', () => {
  const meta = {
    id: 'tiny',
    name: 'Tiny',
    author: 'test',
    playerCount: 2,
    startingFunds: 0,
    incomePerProperty: 1000,
  };

  it('converts rows to tiles and properties', () => {
    const map = asciiToMap('H.C\n~=h', meta);
    expect(map).toMatchObject({ width: 3, height: 2 });
    expect(map.tiles).toEqual(['hq', 'plains', 'city', 'sea', 'road', 'hq']);
    expect(map.properties).toEqual([
      { x: 0, y: 0, owner: 0 },
      { x: 2, y: 0, owner: null },
      { x: 2, y: 1, owner: 1 },
    ]);
  });

  it('reads shoals, reefs, ports and airports', () => {
    const map = asciiToMap(':*QPpTAa', meta);
    expect(map.tiles).toEqual([
      'shoal',
      'reef',
      'port',
      'port',
      'port',
      'airport',
      'airport',
      'airport',
    ]);
    expect(map.properties.map((p) => p.owner)).toEqual([null, 0, 1, null, 0, 1]);
  });

  it('reports ragged rows and unknown characters with the row number', () => {
    expect(() => asciiToMap('...\n..', meta)).toThrow(/row 1 has 2 tiles, expected 3/);
    expect(() => asciiToMap('.?.', meta)).toThrow(/row 0 has unknown character "\?"/);
  });

  it('accepts maps of any size', () => {
    const rows = Array.from({ length: 20 }, (_unused, y) =>
      y === 0 ? 'H' + '.'.repeat(29) : y === 19 ? '.'.repeat(29) + 'h' : '.'.repeat(30),
    );
    const big = new MapRegistry(ruleset).register(asciiToMap(rows.join('\n'), meta));
    expect(big).toMatchObject({ width: 30, height: 20 });
    expect(big.tiles).toHaveLength(600);
  });
});

describe('map validation', () => {
  it('requires exactly one HQ per player', () => {
    const noHq = asciiToMap('R.b', {
      id: 'bad',
      name: 'Bad',
      author: 'test',
      playerCount: 2,
      startingFunds: 0,
      incomePerProperty: 1000,
    });
    expect(validateMap(noHq, ruleset)).toEqual([
      'Player 0 has 0 HQs, expected exactly 1',
      'Player 1 has 0 HQs, expected exactly 1',
    ]);
    expect(() => new MapRegistry(ruleset).register(noHq)).toThrow(/invalid/);
  });

  it('rejects malformed JSON maps', () => {
    expect(() => new MapRegistry(ruleset).register({ ...twinFords, tiles: ['sea'] })).toThrow();
    expect(() => new MapRegistry(ruleset).register({ ...twinFords, formatVersion: 2 })).toThrow();
  });
});

describe('Twin Fords', () => {
  const at = (x: number, y: number) => twinFords.tiles[y * twinFords.width + x];
  const coordsOf = (terrainId: string, owner: number | null) =>
    twinFords.properties
      .filter((p) => at(p.x, p.y) === terrainId && p.owner === owner)
      .map((p) => `${p.x},${p.y}`);

  it('is registered and 16 x 10', () => {
    expect(maps.get('twinFords')).toBe(maps.list()[0]);
    expect(twinFords).toMatchObject({ width: 16, height: 10 });
    expect(TWIN_FORDS_ASCII.trim().split('\n')).toHaveLength(10);
  });

  it('places both players as documented', () => {
    expect(coordsOf('hq', 0)).toEqual(['1,1']);
    expect(coordsOf('base', 0)).toEqual(['2,1', '1,2']);
    expect(coordsOf('hq', 1)).toEqual(['14,8']);
    expect(coordsOf('base', 1)).toEqual(['14,7', '13,8']);
  });

  it('has the documented neutral cities', () => {
    expect(coordsOf('city', null)).toEqual([
      '6,1',
      '12,1',
      '13,2',
      '2,3',
      '6,4',
      '12,4',
      '3,5',
      '9,5',
      '13,6',
      '2,7',
      '3,8',
      '9,8',
    ]);
  });

  it('has the documented terrain totals', () => {
    const counts: Record<string, number> = {};
    for (const id of twinFords.tiles) counts[id] = (counts[id] ?? 0) + 1;
    expect(counts).toEqual({
      sea: 58,
      plains: 36,
      road: 32,
      forest: 8,
      mountain: 6,
      bridge: 2,
      city: 12,
      base: 4,
      hq: 2,
    });
    expect(twinFords.properties).toHaveLength(18);
    expect(at(7, 2)).toBe('bridge');
    expect(at(8, 7)).toBe('bridge');
  });

  it('is rotationally symmetric, so neither side has a positional edge', () => {
    const { width, height, tiles } = twinFords;
    for (let i = 0; i < tiles.length; i++) {
      expect(tiles[tiles.length - 1 - i]).toBe(tiles[i]);
    }
    for (const property of twinFords.properties) {
      const mirror = twinFords.properties.find(
        (p) => p.x === width - 1 - property.x && p.y === height - 1 - property.y,
      )!;
      const expected = property.owner === null ? null : 1 - property.owner;
      expect(mirror.owner).toBe(expected);
    }
  });

  it('starts with no units, no funds beyond first income, and player 1 to move', () => {
    expect(twinFords.units).toEqual([]);
    expect(twinFords.players).toEqual([
      { slot: 0, startingFunds: 0 },
      { slot: 1, startingFunds: 0 },
    ]);
    const state = createGame(compiled, twinFords, {
      seed: 1,
      players: [{ controller: 'local' }, { controller: 'local' }],
    });
    expect(state.activePlayer).toBe(0);
    expect(Object.keys(state.units)).toHaveLength(0);
    expect(state.players.map((p) => p.funds)).toEqual([3000, 0]);
  });
});

describe('Tern Reach', () => {
  const at = (x: number, y: number) => ternReach.tiles[y * ternReach.width + x];
  const coordsOf = (terrainId: string, owner: number | null) =>
    ternReach.properties
      .filter((p) => at(p.x, p.y) === terrainId && p.owner === owner)
      .map((p) => `${p.x},${p.y}`);

  it('is registered and 20 x 14', () => {
    expect(maps.get('ternReach')).toEqual(ternReach);
    expect(ternReach).toMatchObject({ width: 20, height: 14 });
    expect(TERN_REACH_ASCII.trim().split('\n')).toHaveLength(14);
  });

  it('gives each player an HQ, two bases, a port and an airport', () => {
    expect(coordsOf('hq', 0)).toEqual(['1,1']);
    expect(coordsOf('base', 0)).toEqual(['2,1', '1,2']);
    expect(coordsOf('airport', 0)).toEqual(['1,3']);
    expect(coordsOf('port', 0)).toEqual(['8,3']);
    expect(coordsOf('hq', 1)).toEqual(['18,12']);
    expect(coordsOf('base', 1)).toEqual(['18,11', '17,12']);
    expect(coordsOf('airport', 1)).toEqual(['18,10']);
    expect(coordsOf('port', 1)).toEqual(['11,10']);
  });

  it('has two neutral airports on the central island and ten neutral cities', () => {
    expect(coordsOf('airport', null)).toEqual(['10,6', '9,7']);
    expect(coordsOf('city', null)).toEqual([
      '8,2',
      '4,3',
      '16,3',
      '2,5',
      '9,6',
      '10,7',
      '17,8',
      '3,10',
      '15,10',
      '11,11',
    ]);
  });

  it('has the documented terrain totals', () => {
    const counts: Record<string, number> = {};
    for (const id of ternReach.tiles) counts[id] = (counts[id] ?? 0) + 1;
    expect(counts).toEqual({
      sea: 168,
      plains: 36,
      road: 20,
      shoal: 14,
      forest: 10,
      reef: 6,
      mountain: 2,
      bridge: 2,
      city: 10,
      base: 4,
      hq: 2,
      port: 2,
      airport: 4,
    });
    expect(ternReach.properties).toHaveLength(22);
    expect(at(7, 6)).toBe('bridge');
    expect(at(12, 7)).toBe('bridge');
  });

  it('is rotationally symmetric, so neither side has a positional edge', () => {
    const { width, height, tiles } = ternReach;
    for (let i = 0; i < tiles.length; i++) expect(tiles[tiles.length - 1 - i]).toBe(tiles[i]);
    for (const property of ternReach.properties) {
      const mirror = ternReach.properties.find(
        (p) => p.x === width - 1 - property.x && p.y === height - 1 - property.y,
      )!;
      expect(mirror.owner).toBe(property.owner === null ? null : 1 - property.owner);
    }
  });

  it('puts each port on open water', () => {
    for (const [x, y] of [
      [8, 3],
      [11, 10],
    ] as const) {
      const neighbours = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      expect(neighbours).toContain('sea');
    }
  });
});
