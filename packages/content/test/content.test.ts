import { compileRuleset, createGame, NO_DAMAGE } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import {
  asciiToMap,
  maps,
  MapRegistry,
  ruleset,
  TWIN_FORDS_ASCII,
  twinFords,
  validateMap,
} from '../src/index';

const compiled = compileRuleset(ruleset);

describe('ruleset', () => {
  it('compiles without dangling references', () => {
    expect(compiled.unitCount).toBe(10);
    expect(compiled.moveTypes).toEqual(['foot', 'mech', 'tread', 'tire', 'air', 'sea', 'lander']);
  });

  it('gives every armed land unit a target, except anti-air-only missiles', () => {
    for (let attacker = 0; attacker < compiled.unitCount; attacker++) {
      const unit = compiled.units[attacker]!;
      let targets = 0;
      for (let defender = 0; defender < compiled.unitCount; defender++) {
        const cell = attacker * compiled.unitCount + defender;
        if (compiled.primaryDamage[cell] !== NO_DAMAGE) targets++;
        else if (compiled.secondaryDamage[cell] !== NO_DAMAGE) targets++;
      }
      if (unit.maxRange === 0 || unit.id === 'missiles') expect(targets).toBe(0);
      else expect(targets).toBe(compiled.unitCount);
    }
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
