import { ruleset as rawRuleset, twinFords } from '@tactics/content';
import { compileRuleset, NO_TILE, NO_UNIT } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { newGameRecord } from '../src/session/gameSession';
import { coverOf, fullHpCover, levelOf, shownUnit } from '../src/ui/intel';

const ruleset = compileRuleset(rawRuleset);
const map = {
  ...twinFords,
  units: [
    { x: 4, y: 4, type: 'tank', owner: 0 },
    { x: 6, y: 4, type: 'infantry', owner: 1 },
    // A city, a forest and a mountain on the top row.
    { x: 6, y: 1, type: 'mech', owner: 0 },
    { x: 4, y: 1, type: 'infantry', owner: 0, hp: 50 },
    { x: 9, y: 1, type: 'bomber', owner: 0 },
  ],
};
const state = newGameRecord(ruleset, map, 1).state;
const at = (x: number, y: number) => y * map.width + x;
const tank = state.occupant[at(4, 4)]!;
const infantry = state.occupant[at(6, 4)]!;
const idle = { mode: 'idle', selectedUnit: NO_UNIT, path: [] } as const;

describe('the unit the info panel shows', () => {
  it('is the unit under the cursor', () => {
    expect(shownUnit(state, { ...idle, cursor: at(6, 4) })).toBe(infantry);
    expect(shownUnit(state, { ...idle, cursor: at(5, 4) })).toBe(NO_UNIT);
    expect(shownUnit(state, { ...idle, cursor: NO_TILE })).toBe(NO_UNIT);
  });

  it('is the moving unit at the end of its path', () => {
    const moving = { mode: 'moving', selectedUnit: tank, path: [at(5, 4)] } as const;
    expect(shownUnit(state, { ...moving, cursor: at(5, 4) })).toBe(tank);
    expect(shownUnit(state, { ...moving, mode: 'actionMenu', cursor: at(5, 4) })).toBe(tank);
    // Off the path's end, the tile is described on its own.
    expect(shownUnit(state, { ...moving, cursor: at(5, 5) })).toBe(NO_UNIT);
    // A unit under the cursor is still shown, even while another moves.
    expect(shownUnit(state, { ...moving, cursor: at(6, 4) })).toBe(infantry);
  });
});

describe('terrain cover', () => {
  const unitAt = (x: number, y: number) => state.units[state.occupant[at(x, y)]!]!;

  it('takes one percent off damage per star per HP pip', () => {
    expect(coverOf(ruleset, state, unitAt(6, 1), at(6, 1))).toEqual({ stars: 3, percent: 30 });
    // A forest is worth 2 stars, but only half as much to a unit at 5 HP.
    expect(coverOf(ruleset, state, unitAt(4, 1), at(4, 1))).toEqual({ stars: 2, percent: 10 });
    expect(coverOf(ruleset, state, unitAt(4, 4), at(4, 4))).toEqual({ stars: 0, percent: 0 });
  });

  it('is measured on the tile asked about, such as where a unit is moving to', () => {
    expect(coverOf(ruleset, state, unitAt(4, 4), at(9, 1))).toEqual({ stars: 4, percent: 40 });
  });

  it('is nothing for aircraft, whatever they fly over', () => {
    expect(coverOf(ruleset, state, unitAt(9, 1), at(9, 1))).toEqual({ stars: 0, percent: 0 });
  });

  it('is worth ten percent a star to a unit at full HP', () => {
    expect(fullHpCover(ruleset, 0)).toBe(0);
    expect(fullHpCover(ruleset, 3)).toBe(30);
  });
});

describe('gauge levels', () => {
  it('are low at or below 30%, high above 60%, and mid between', () => {
    expect(levelOf(3, 10)).toBe('low');
    expect(levelOf(4, 10)).toBe('mid');
    expect(levelOf(6, 10)).toBe('mid');
    expect(levelOf(7, 10)).toBe('high');
    expect(levelOf(99, 99)).toBe('high');
    expect(levelOf(0, 0)).toBe('low');
  });
});
