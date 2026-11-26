import { describe, expect, it } from 'vitest';
import { getUnitOptions, type Action, type GameState } from '../src/index';
import { apply, makeGame, reject, unitAt } from './fixtures';
import { navalRules } from './navalFixtures';

function play(state: GameState, action: Action): GameState {
  return apply(state, action, navalRules).state;
}

describe('landers', () => {
  it('take on and put down ground units only from a shoal or port', () => {
    let state = makeGame(
      ['.:~~', '..~~'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'lander', owner: 0 },
        { x: 0, y: 1, type: 'tank', owner: 0 },
        { x: 1, y: 1, type: 'infantry', owner: 1 },
      ],
      1,
      navalRules,
    );
    const infantry = unitAt(state, 0, 0).id;
    const lander = unitAt(state, 1, 0).id;
    const tank = unitAt(state, 0, 1).id;
    state = play(state, { type: 'Load', unit: infantry, path: [1] });
    state = play(state, { type: 'Load', unit: tank, path: [0, 1] });
    expect(state.units[lander]!.cargo).toEqual([infantry, tank]);
    state = play(play(state, { type: 'EndTurn' }), { type: 'EndTurn' });

    // Out on the water nobody can get off.
    expect(getUnitOptions(navalRules, state, lander, 2).unloads).toEqual([]);
    const fromSea: Action = {
      type: 'Unload',
      unit: lander,
      path: [2],
      drops: [{ cargo: tank, to: 3 }],
    };
    expect(reject(state, fromSea, navalRules)).toMatch(/cannot disembark/);

    // On the shoal, the cargo steps ashore.
    const landed = play(state, {
      type: 'Unload',
      unit: lander,
      path: [],
      drops: [{ cargo: tank, to: 0 }],
    });
    expect(landed.units[tank]).toMatchObject({ pos: 0, carrier: -1 });
    expect(landed.units[lander]!.cargo).toEqual([infantry]);
  });
});
