import { asciiToMap, ruleset as rawRuleset } from '@tactics/content';
import { applyAction, compileRuleset, createGame, type GameState } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { unitsLostToFuel } from '../src/ui/fuelLosses';

const ruleset = compileRuleset(rawRuleset);

function endTurn(state: GameState) {
  const result = applyAction(ruleset, state, { type: 'EndTurn' });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('unitsLostToFuel', () => {
  it('names the units that crashed as the turn began, and no other losses', () => {
    const map = asciiToMap('......', {
      id: 'test',
      name: 'Test',
      author: 'test',
      playerCount: 2,
      startingFunds: 0,
      incomePerProperty: 1000,
    });
    const units = [
      { x: 0, y: 0, type: 'fighter', owner: 0 },
      { x: 1, y: 0, type: 'tank', owner: 0 },
      { x: 5, y: 0, type: 'infantry', owner: 1 },
    ];
    const start = createGame(
      ruleset,
      { ...map, units },
      {
        seed: 1,
        players: [{ controller: 'local' }, { controller: 'local' }],
      },
    );
    const fighter = start.occupant[0]!;
    const tank = start.occupant[1]!;
    const lowOnFuel = {
      ...start,
      units: { ...start.units, [fighter]: { ...start.units[fighter]!, fuel: 3 } },
    };

    const previous = endTurn(lowOnFuel).state;
    const { events } = endTurn(previous);
    expect(unitsLostToFuel(ruleset, previous, events)).toEqual(['Fighter']);

    const inCombat = [{ type: 'UnitDestroyed', unit: tank, at: 1, cause: 'combat' } as const];
    expect(unitsLostToFuel(ruleset, previous, inCombat)).toEqual([]);
  });
});
