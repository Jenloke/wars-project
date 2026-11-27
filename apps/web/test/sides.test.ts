import { ruleset as rawRuleset, twinFords } from '@tactics/content';
import { applyAction, compileRuleset, incomeOf } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { newGameRecord } from '../src/session/gameSession';
import { sideStats } from '../src/ui/sides';

const ruleset = compileRuleset(rawRuleset);
const map = {
  ...twinFords,
  units: [
    { x: 4, y: 4, type: 'apc', owner: 0 },
    { x: 4, y: 5, type: 'infantry', owner: 0 },
    { x: 6, y: 4, type: 'infantry', owner: 1 },
  ],
};
const at = (x: number, y: number) => y * map.width + x;

describe('side stats', () => {
  const state = newGameRecord(ruleset, map, 1, [], ['iska', 'corvin']).state;

  it('count each side’s properties and units, and its income after commander modifiers', () => {
    const owned = (seat: number) => state.owner.filter((owner) => owner === seat).length;
    expect(sideStats(ruleset, state, 0)).toEqual({
      funds: state.players[0]!.funds,
      income: incomeOf(ruleset, state, 0),
      properties: owned(0),
      units: 2,
    });
    expect(sideStats(ruleset, state, 1)).toMatchObject({ properties: owned(1), units: 1 });
    expect(owned(0)).toBeGreaterThan(0);
  });

  it('count units carried in transports', () => {
    const infantry = state.occupant[at(4, 5)]!;
    const loaded = applyAction(ruleset, state, { type: 'Load', unit: infantry, path: [at(4, 4)] });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.occupant[at(4, 5)]).not.toBe(infantry);
    expect(sideStats(ruleset, loaded.state, 0).units).toBe(2);
  });
});
