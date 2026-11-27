import { ruleset as rawRuleset, twinFords } from '@tactics/content';
import { compileRuleset, NO_TILE, NO_UNIT } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { newGameRecord } from '../src/session/gameSession';
import { shownUnit } from '../src/ui/intel';

const ruleset = compileRuleset(rawRuleset);
const map = {
  ...twinFords,
  units: [
    { x: 4, y: 4, type: 'tank', owner: 0 },
    { x: 6, y: 4, type: 'infantry', owner: 1 },
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
