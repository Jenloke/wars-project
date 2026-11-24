import { describe, expect, it } from 'vitest';
import { costsFrom, costsTo, FAR, tilesInRange } from '../src/distance';
import { makeGame, rules } from './fixtures';

const tread = rules.moveTypeIndex.get('tread')!;

describe('terrain distances', () => {
  it('charges the terrain of every tile entered', () => {
    const state = makeGame(['.F.']);
    // Plains cost 1 and forest 2 for treads.
    expect(Array.from(costsFrom(rules, state, tread, [0]))).toEqual([0, 2, 3]);
    expect(Array.from(costsTo(rules, state, tread, [2]))).toEqual([3, 1, 0]);
  });

  it('measures toward the goal, which differs from away on mixed terrain', () => {
    const state = makeGame(['.F']);
    expect(costsFrom(rules, state, tread, [0])[1]).toBe(2);
    expect(costsTo(rules, state, tread, [0])[1]).toBe(1);
  });

  it('marks tiles cut off by impassable terrain as far', () => {
    const state = makeGame(['.~.']);
    expect(Array.from(costsFrom(rules, state, tread, [0]))).toEqual([0, FAR, FAR]);
  });

  it('takes the nearest of several goals', () => {
    const state = makeGame(['.....']);
    expect(Array.from(costsTo(rules, state, tread, [0, 4]))).toEqual([0, 1, 2, 1, 0]);
  });
});

describe('tilesInRange', () => {
  it('lists the ring between the minimum and maximum range', () => {
    // 8 tiles at distance 2 and 12 at distance 3 around the middle of a 7x7 map.
    expect(tilesInRange(24, 2, 3, 7, 7, [])).toHaveLength(20);
    expect(tilesInRange(24, 1, 1, 7, 7, []).sort((a, b) => a - b)).toEqual([17, 23, 25, 31]);
  });

  it('clips the ring at the map edge', () => {
    expect(tilesInRange(0, 1, 1, 7, 7, []).sort((a, b) => a - b)).toEqual([1, 7]);
  });
});
