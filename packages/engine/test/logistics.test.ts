import { describe, expect, it } from 'vitest';
import { getBuildOptions, getUnitOptions, type GameState } from '../src/index';
import { apply, at, makeGame, reject, rules, unitAt, withUnit } from './fixtures';

function fullRound(state: GameState): GameState {
  return apply(apply(state, { type: 'EndTurn' }).state, { type: 'EndTurn' }).state;
}

function withFunds(state: GameState, player: number, funds: number): GameState {
  const players = state.players.map((p, i) => (i === player ? { ...p, funds } : p));
  return { ...state, players };
}

describe('repair and resupply on owned properties', () => {
  const setup = () => makeGame(['c..'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);

  it('heals 20 HP for a proportional cost and refills fuel and ammo', () => {
    const base = setup();
    const id = unitAt(base, 0, 0).id;
    const damaged = withUnit(withFunds(base, 0, 1000), id, { hp: 50, fuel: 10, ammo: 0 });
    const state = fullRound(damaged);
    // 1000 + 1000 income, minus 20% of a 7000 tank.
    expect(state.units[id]).toMatchObject({ hp: 70, fuel: 70, ammo: 2 });
    expect(state.players[0]!.funds).toBe(600);
  });

  it('heals only what the player can afford', () => {
    const base = setup();
    const id = unitAt(base, 0, 0).id;
    const state = fullRound(withUnit(withFunds(base, 0, 0), id, { hp: 50 }));
    expect(state.units[id]!.hp).toBe(60);
    expect(state.players[0]!.funds).toBe(300);
  });

  it('never heals above full HP', () => {
    const base = setup();
    const id = unitAt(base, 0, 0).id;
    const state = fullRound(withUnit(withFunds(base, 0, 0), id, { hp: 95 }));
    expect(state.units[id]!.hp).toBe(100);
    expect(state.players[0]!.funds).toBe(1000 - 350);
  });

  it('does nothing on a property the player does not own', () => {
    const base = makeGame(['C..'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const id = unitAt(base, 0, 0).id;
    const state = fullRound(withUnit(base, id, { hp: 50, fuel: 10 }));
    expect(state.units[id]).toMatchObject({ hp: 50, fuel: 10 });
  });
});

describe('APC supply', () => {
  const setup = () => {
    const base = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'apc', owner: 0 },
        { x: 2, y: 0, type: 'tank', owner: 0 },
      ],
    );
    return withUnit(base, unitAt(base, 2, 0).id, { fuel: 5, ammo: 0 });
  };

  it('resupplies adjacent units with the Supply action', () => {
    const state = setup();
    const apc = unitAt(state, 0, 0).id;
    expect(getUnitOptions(rules, state, apc, 0).canSupply).toBe(false);
    expect(getUnitOptions(rules, state, apc, 1).canSupply).toBe(true);
    expect(reject(state, { type: 'Supply', unit: apc, path: [] })).toMatch(/No adjacent/);

    const next = apply(state, { type: 'Supply', unit: apc, path: [1] }).state;
    expect(unitAt(next, 2, 0)).toMatchObject({ fuel: 70, ammo: 2 });
    expect(next.units[apc]!.moved).toBe(true);
  });

  it('resupplies adjacent units at the start of the turn', () => {
    let state = setup();
    const apc = unitAt(state, 0, 0).id;
    state = apply(state, { type: 'Move', unit: apc, path: [1] }).state;
    expect(unitAt(state, 2, 0).fuel).toBe(5);
    state = fullRound(state);
    expect(unitAt(state, 2, 0)).toMatchObject({ fuel: 70, ammo: 2 });
  });

  it('is unavailable to units that cannot supply', () => {
    const state = setup();
    expect(reject(state, { type: 'Supply', unit: unitAt(state, 2, 0).id, path: [1] })).toMatch(
      /cannot supply/,
    );
  });
});

describe('join', () => {
  it('merges HP, fuel and ammo and refunds the excess', () => {
    const base = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'tank', owner: 0, hp: 40 },
        { x: 1, y: 0, type: 'tank', owner: 0, hp: 70 },
      ],
    );
    const mover = unitAt(base, 0, 0).id;
    const target = unitAt(base, 1, 0).id;
    const state = withUnit(withUnit(base, mover, { fuel: 30, ammo: 1 }), target, {
      fuel: 50,
      ammo: 2,
    });
    expect(getUnitOptions(rules, state, mover, 1)).toMatchObject({ canJoin: true, canWait: false });

    const next = apply(state, { type: 'Join', unit: mover, path: [1] }).state;
    expect(next.units[mover]).toBeUndefined();
    expect(next.units[target]).toMatchObject({ hp: 100, fuel: 70, ammo: 2, moved: true });
    expect(next.occupant[0]).toBe(-1);
    expect(next.occupant[1]).toBe(target);
    // 4 + 7 pips = 11, one pip over the cap: a tenth of a 7000 tank.
    expect(next.players[0]!.funds).toBe(700);
  });

  it('is refused for full-HP targets and different unit types', () => {
    const state = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'tank', owner: 0, hp: 40 },
        { x: 1, y: 0, type: 'tank', owner: 0 },
      ],
    );
    expect(reject(state, { type: 'Join', unit: unitAt(state, 0, 0).id, path: [1] })).toMatch(
      /cannot join/,
    );
    const mixed = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'tank', owner: 0, hp: 40 },
      ],
    );
    expect(reject(mixed, { type: 'Join', unit: unitAt(mixed, 0, 0).id, path: [1] })).toMatch(
      /cannot join/,
    );
  });
});

describe('transport', () => {
  const setup = () =>
    makeGame(
      ['.....', '~~~~~'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'apc', owner: 0 },
        { x: 4, y: 0, type: 'tank', owner: 0 },
      ],
    );

  it('loads a unit, carries it and unloads it next to the transport', () => {
    let state = setup();
    const infantry = unitAt(state, 0, 0).id;
    const apc = unitAt(state, 1, 0).id;
    expect(getUnitOptions(rules, state, infantry, 1).canLoad).toBe(true);

    state = apply(state, { type: 'Load', unit: infantry, path: [1] }).state;
    expect(state.units[infantry]).toMatchObject({ pos: -1, carrier: apc, moved: true });
    expect(state.units[apc]!.cargo).toEqual([infantry]);
    expect(state.occupant[0]).toBe(-1);
    expect(state.occupant[1]).toBe(apc);

    const options = getUnitOptions(rules, state, apc, 2);
    // From tile 2 the cargo can step back to 1 (vacated by the APC) or on to 3.
    expect(options.unloads).toEqual([{ cargo: infantry, tiles: [3, 1] }]);

    state = apply(state, {
      type: 'Unload',
      unit: apc,
      path: [2],
      drops: [{ cargo: infantry, to: 3 }],
    }).state;
    expect(state.units[infantry]).toMatchObject({ pos: 3, carrier: -1, moved: true });
    expect(state.units[apc]).toMatchObject({ pos: 2, cargo: [], moved: true });
    expect(state.occupant[3]).toBe(infantry);
  });

  it('refuses units it cannot carry and bad drop tiles', () => {
    let state = setup();
    const infantry = unitAt(state, 0, 0).id;
    const apc = unitAt(state, 1, 0).id;
    const tank = unitAt(state, 4, 0).id;
    expect(reject(state, { type: 'Load', unit: tank, path: [3, 2, 1] })).toMatch(/cannot board/);

    state = apply(state, { type: 'Load', unit: infantry, path: [1] }).state;
    const drop = (to: number) =>
      reject(state, { type: 'Unload', unit: apc, path: [], drops: [{ cargo: infantry, to }] });
    expect(drop(at(state, 1, 1))).toMatch(/blocked/); // sea
    expect(drop(3)).toMatch(/not next to/);
    expect(reject(state, { type: 'Unload', unit: apc, path: [], drops: [] })).toMatch(/Nothing/);
    expect(
      reject(state, { type: 'Unload', unit: apc, path: [], drops: [{ cargo: tank, to: 0 }] }),
    ).toMatch(/not carried/);
  });

  it('loses its cargo when destroyed', () => {
    let state = makeGame(
      ['====='],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'apc', owner: 0, hp: 10 },
        { x: 2, y: 0, type: 'tank', owner: 1 },
        { x: 4, y: 0, type: 'infantry', owner: 0 },
      ],
    );
    const infantry = unitAt(state, 0, 0).id;
    const apc = unitAt(state, 1, 0).id;
    state = apply(state, { type: 'Load', unit: infantry, path: [1] }).state;
    state = apply(state, { type: 'EndTurn' }).state;
    state = apply(state, {
      type: 'Attack',
      unit: unitAt(state, 2, 0).id,
      path: [],
      target: 1,
    }).state;
    expect(state.units[apc]).toBeUndefined();
    expect(state.units[infantry]).toBeUndefined();
    expect(state.status.kind).toBe('playing');
  });
});

describe('build', () => {
  const setup = () => makeGame(['R.c', '..b'], [{ x: 1, y: 0, type: 'infantry', owner: 1 }]);

  it('creates a unit that cannot act until next turn and charges funds', () => {
    const state = setup(); // two properties: 2000 opening income
    const infantry = rules.unitIndex.get('infantry')!;
    const result = apply(state, { type: 'Build', at: 0, unitType: infantry });
    const built = unitAt(result.state, 0, 0);
    expect(built).toMatchObject({ type: infantry, owner: 0, hp: 100, moved: true });
    expect(result.state.players[0]!.funds).toBe(1000);
    expect(result.state.nextUnitId).toBe(state.nextUnitId + 1);
    expect(reject(result.state, { type: 'Move', unit: built.id, path: [3] })).toMatch(/acted/);
  });

  it('lists options with affordability and refuses illegal builds', () => {
    const state = setup();
    const infantry = rules.unitIndex.get('infantry')!;
    const tank = rules.unitIndex.get('tank')!;
    const options = getBuildOptions(rules, state, 0);
    expect(options.find((o) => o.unitType === infantry)).toMatchObject({
      cost: 1000,
      affordable: true,
    });
    expect(options.find((o) => o.unitType === tank)).toMatchObject({ affordable: false });
    expect(getBuildOptions(rules, state, 2)).toEqual([]); // a city builds nothing

    expect(reject(state, { type: 'Build', at: 0, unitType: tank })).toMatch(/funds/);
    expect(reject(state, { type: 'Build', at: 5, unitType: infantry })).toMatch(/do not own/);
    expect(reject(state, { type: 'Build', at: 2, unitType: infantry })).toMatch(/cannot be built/);
    const occupied = apply(state, { type: 'Build', at: 0, unitType: infantry }).state;
    expect(reject(occupied, { type: 'Build', at: 0, unitType: infantry })).toMatch(/occupied/);
  });
});
