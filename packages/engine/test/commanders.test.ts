import { describe, expect, it } from 'vitest';
import {
  attackTargetsFrom,
  captureAmount,
  compileRuleset,
  createGame,
  maxRangeOf,
  moveBudget,
  previewAttack,
  type CompiledRuleset,
  type GameState,
  type RawModifier,
} from '../src/index';
import {
  apply,
  at,
  makeMap,
  reject,
  testRuleset,
  unitAt,
  withUnit,
  type PlacedUnit,
} from './fixtures';

/** The test ruleset with one extra commander, `test`, whose innate modifiers are given. */
function rulesWith(modifiers: readonly RawModifier[]): CompiledRuleset {
  return compileRuleset({
    ...testRuleset,
    commanders: [...testRuleset.commanders, { id: 'test', name: 'Test', modifiers }],
  });
}

/** A game in which player 0 is led by the `test` commander and player 1 by none. */
function gameWith(
  ruleset: CompiledRuleset,
  rows: readonly string[],
  units: readonly PlacedUnit[] = [],
): GameState {
  return createGame(ruleset, makeMap(rows, units), {
    seed: 1,
    players: [{ controller: 'local', commander: 'test' }, { controller: 'local' }],
  });
}

function fullRound(ruleset: CompiledRuleset, state: GameState): GameState {
  const next = apply(state, { type: 'EndTurn' }, ruleset).state;
  return apply(next, { type: 'EndTurn' }, ruleset).state;
}

function withFunds(state: GameState, player: number, funds: number): GameState {
  return { ...state, players: state.players.map((p, i) => (i === player ? { ...p, funds } : p)) };
}

describe('commander range modifiers', () => {
  const units: PlacedUnit[] = [
    { x: 0, y: 0, type: 'artillery', owner: 0 },
    { x: 4, y: 0, type: 'tank', owner: 1 },
  ];

  it('stretch indirect fire and let it hit what was out of reach', () => {
    const unmodified = rulesWith([]);
    const plain = gameWith(unmodified, ['.....'], units);
    const artillery = unitAt(plain, 0, 0);
    const fire = { type: 'Attack', unit: artillery.id, path: [], target: 4 } as const;
    expect(reject(plain, fire, unmodified)).toBe('Target is out of range');

    const ruleset = rulesWith([{ hook: 'range', value: 1 }]);
    const state = gameWith(ruleset, ['.....'], units);
    expect(maxRangeOf(ruleset, state, 0, artillery.type)).toBe(4);
    expect(attackTargetsFrom(ruleset, state, artillery, 0, false)).toEqual([4]);
    const result = apply(
      state,
      { type: 'Attack', unit: artillery.id, path: [], target: 4 },
      ruleset,
    );
    expect(result.state.units[unitAt(state, 4, 0).id]!.hp).toBeLessThan(100);
  });

  it('leave direct units at their range', () => {
    const ruleset = rulesWith([{ hook: 'range', value: 2 }]);
    const state = gameWith(ruleset, ['.....'], units);
    expect(maxRangeOf(ruleset, state, 0, ruleset.unitIndex.get('tank')!)).toBe(1);
    expect(maxRangeOf(ruleset, state, 0, ruleset.unitIndex.get('infantry')!)).toBe(1);
  });

  it('never shorten fire below the minimum range', () => {
    const ruleset = rulesWith([{ hook: 'range', value: -5 }]);
    const state = gameWith(ruleset, ['.....'], units);
    expect(maxRangeOf(ruleset, state, 0, ruleset.unitIndex.get('artillery')!)).toBe(2);
  });
});

describe('commander capture modifiers', () => {
  const capture = (modifiers: RawModifier[], hp = 100) => {
    const ruleset = rulesWith(modifiers);
    const base = gameWith(ruleset, ['C..'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const unit = unitAt(base, 0, 0);
    const state = withUnit(base, unit.id, { hp });
    return {
      ruleset,
      state,
      unit: state.units[unit.id]!,
      result: apply(state, { type: 'Capture', unit: unit.id, path: [] }, ruleset),
    };
  };

  it('speed captures by a percentage of displayed HP', () => {
    const { ruleset, state, unit, result } = capture([{ hook: 'capture', value: 50 }]);
    expect(captureAmount(ruleset, state, unit)).toBe(15);
    expect(result.state.capture[0]).toBe(5);
  });

  it('can take a property in one turn', () => {
    const { result } = capture([{ hook: 'capture', value: 100 }]);
    expect(result.state.owner[0]).toBe(0);
    expect(result.events).toContainEqual({ type: 'Captured', at: 0, by: 0 });
  });

  it('round down but always capture at least one point', () => {
    expect(capture([{ hook: 'capture', value: 50 }], 30).result.state.capture[0]).toBe(16);
    expect(capture([{ hook: 'capture', value: -95 }]).result.state.capture[0]).toBe(19);
  });
});

describe('commander income modifiers', () => {
  it('scale what each property pays, from the opening turn on', () => {
    const ruleset = rulesWith([{ hook: 'income', value: 20 }]);
    const state = gameWith(ruleset, ['Rc.b']);
    expect(state.players[0]!.funds).toBe(2400);
    const next = apply(state, { type: 'EndTurn' }, ruleset).state;
    expect(next.players[1]!.funds).toBe(1000);
    expect(apply(next, { type: 'EndTurn' }, ruleset).state.players[0]!.funds).toBe(4800);
  });
});

describe('commander repair modifiers', () => {
  it('repair more HP on owned properties, at the usual price per HP', () => {
    const ruleset = rulesWith([{ hook: 'repair', value: 10 }]);
    const base = gameWith(ruleset, ['c..'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const id = unitAt(base, 0, 0).id;
    const state = fullRound(ruleset, withUnit(withFunds(base, 0, 5000), id, { hp: 50 }));
    expect(state.units[id]!.hp).toBe(80);
    // 5000 + 1000 income, minus 30% of a 7000 tank.
    expect(state.players[0]!.funds).toBe(3900);
  });
});

describe('commander regeneration', () => {
  const units: PlacedUnit[] = [
    { x: 0, y: 0, type: 'tank', owner: 0 },
    { x: 1, y: 0, type: 'infantry', owner: 0 },
    { x: 3, y: 0, type: 'tank', owner: 1 },
  ];

  const wounded = (ruleset: CompiledRuleset, hp: number) => {
    let state = gameWith(ruleset, ['....'], units);
    for (const id of Object.keys(state.units)) state = withUnit(state, Number(id), { hp });
    return state;
  };

  it("heals the owner's units for free at the start of their turn, wherever they are", () => {
    const ruleset = rulesWith([{ hook: 'regen', value: 10 }]);
    const state = wounded(ruleset, 50);
    const enemyTurn = apply(state, { type: 'EndTurn' }, ruleset).state;
    expect(unitAt(enemyTurn, 0, 0).hp).toBe(50);
    expect(unitAt(enemyTurn, 3, 0).hp).toBe(50);

    const next = fullRound(ruleset, state);
    expect(unitAt(next, 0, 0).hp).toBe(60);
    expect(unitAt(next, 1, 0).hp).toBe(60);
    expect(unitAt(next, 3, 0).hp).toBe(50);
    expect(next.players[0]!.funds).toBe(0);
  });

  it('never heals above full HP and only heals the units it names', () => {
    const ruleset = rulesWith([{ hook: 'regen', units: ['foot'], value: 10 }]);
    const next = fullRound(ruleset, wounded(ruleset, 95));
    expect(unitAt(next, 0, 0).hp).toBe(95);
    expect(unitAt(next, 1, 0).hp).toBe(100);
  });

  it('heals units carried in a transport', () => {
    const ruleset = rulesWith([{ hook: 'regen', value: 20 }]);
    const base = gameWith(
      ruleset,
      ['...'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'apc', owner: 0 },
        { x: 2, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const rider = unitAt(base, 0, 0).id;
    const loaded = apply(
      withUnit(base, rider, { hp: 40 }),
      { type: 'Load', unit: rider, path: [1] },
      ruleset,
    );
    expect(fullRound(ruleset, loaded.state).units[rider]!.hp).toBe(60);
  });

  it('wears units down when negative, but never destroys them', () => {
    const ruleset = rulesWith([{ hook: 'regen', value: -30 }]);
    const next = fullRound(ruleset, wounded(ruleset, 20));
    expect(unitAt(next, 0, 0).hp).toBe(1);
    expect(unitAt(next, 1, 0).hp).toBe(1);
  });
});

describe('commander modifier selectors', () => {
  it('name units by id, move type, tag or weapon class', () => {
    const ruleset = rulesWith([
      { hook: 'attack', units: ['direct'], value: 10 },
      { hook: 'defence', units: ['indirect'], value: 10 },
      { hook: 'cost', units: ['tread'], value: -10 },
      { hook: 'movement', units: ['infantry'], value: 1 },
    ]);
    const passive = ruleset.commanders[2]!.passive;
    const type = (id: string) => ruleset.unitIndex.get(id)!;
    expect(passive.attack[type('tank')]).toBe(110);
    expect(passive.attack[type('infantry')]).toBe(110);
    expect(passive.attack[type('artillery')]).toBe(100);
    expect(passive.attack[type('apc')]).toBe(100);
    expect(passive.defence[type('artillery')]).toBe(110);
    expect(passive.defence[type('tank')]).toBe(100);
    expect(passive.cost[type('apc')]).toBe(90);
    expect(passive.cost[type('infantry')]).toBe(100);
    expect(passive.movement[type('infantry')]).toBe(1);
  });

  it('refuse a selector that matches no unit', () => {
    expect(() => rulesWith([{ hook: 'attack', units: ['dragon'], value: 10 }])).toThrow(
      /Commander "test".*"dragon" matches no unit/,
    );
  });

  it('apply firepower and defence in the damage formula', () => {
    const units: PlacedUnit[] = [
      { x: 0, y: 0, type: 'tank', owner: 0 },
      { x: 1, y: 0, type: 'tank', owner: 1 },
    ];
    // Tank on tank is 60 base on a road: 60 * 130% = 78, then 78 * (200 - 100) / 100.
    const stronger = rulesWith([{ hook: 'attack', value: 30 }]);
    const state = gameWith(stronger, ['=='], units);
    expect(previewAttack(stronger, state, unitAt(state, 0, 0).id, 0, 1)!.min).toBe(78);
    // Defending at 120% leaves a defence factor of 200 - 120 = 80: 60 * 80 / 100.
    const tougher = rulesWith([{ hook: 'defence', value: 20 }]);
    const other = gameWith(tougher, ['=='], units);
    expect(previewAttack(tougher, other, unitAt(other, 1, 0).id, 1, 0)!.min).toBe(48);
  });
});

describe('commander movement modifiers', () => {
  it('never take a unit below zero move points', () => {
    const ruleset = rulesWith([{ hook: 'movement', value: -10 }]);
    const state = gameWith(ruleset, ['...'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const unit = unitAt(state, 0, 0);
    expect(moveBudget(ruleset, state, unit)).toBe(0);
    expect(reject(state, { type: 'Move', unit: unit.id, path: [at(state, 1, 0)] }, ruleset)).toBe(
      'Path exceeds movement range',
    );
  });
});
