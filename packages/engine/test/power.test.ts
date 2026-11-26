import { describe, expect, it } from 'vitest';
import {
  canActivatePower,
  compileRuleset,
  createGame,
  createSave,
  previewAttack,
  replay,
  restoreSave,
  type CompiledRuleset,
  type GameState,
  type RawModifier,
  type RawPower,
  type SaveData,
} from '../src/index';
import {
  apply,
  makeMap,
  reject,
  SCRIPT_ROWS,
  scriptedActions,
  testRuleset,
  unitAt,
  withUnit,
  type PlacedUnit,
} from './fixtures';

const ACTIVATE = { type: 'ActivatePower' } as const;
const END_TURN = { type: 'EndTurn' } as const;

/** The test ruleset plus a commander `test` with this power and innate modifiers. */
function rulesWith(power: RawPower, modifiers: readonly RawModifier[] = []): CompiledRuleset {
  return compileRuleset({
    ...testRuleset,
    commanders: [...testRuleset.commanders, { id: 'test', name: 'Test', modifiers, power }],
  });
}

/** A game in which player 0 is led by `test` and starts with `meter` points. */
function gameWith(
  ruleset: CompiledRuleset,
  rows: readonly string[],
  units: readonly PlacedUnit[] = [],
  meter = 1000,
): GameState {
  const state = createGame(ruleset, makeMap(rows, units), {
    seed: 1,
    players: [{ controller: 'local', commander: 'test' }, { controller: 'local' }],
  });
  return withMeter(state, 0, meter);
}

function withMeter(state: GameState, player: number, power: number): GameState {
  return { ...state, players: state.players.map((p, i) => (i === player ? { ...p, power } : p)) };
}

const tanks: PlacedUnit[] = [
  { x: 0, y: 0, type: 'tank', owner: 0 },
  { x: 1, y: 0, type: 'tank', owner: 1 },
];

describe('activating a power', () => {
  const firepower = rulesWith({
    name: 'Volley',
    cost: 1000,
    modifiers: [{ hook: 'attack', value: 30 }],
  });

  it('is refused without a power, before the meter is full, and while it is active', () => {
    const plain = createGame(firepower, makeMap(['==']), {
      seed: 1,
      players: [{ controller: 'local' }, { controller: 'local' }],
    });
    expect(reject(plain, ACTIVATE, firepower)).toBe('Your commander has no power');

    const short = gameWith(firepower, ['=='], tanks, 999);
    expect(canActivatePower(firepower, short)).toBe(false);
    expect(reject(short, ACTIVATE, firepower)).toBe('The power meter is not full');

    const ready = gameWith(firepower, ['=='], tanks, 1000);
    expect(canActivatePower(firepower, ready)).toBe(true);
    const active = withMeter(apply(ready, ACTIVATE, firepower).state, 0, 5000);
    expect(reject(active, ACTIVATE, firepower)).toBe('The power is already active');
  });

  it('spends the meter and adds its modifiers to the innate ones', () => {
    const ruleset = rulesWith(
      { name: 'Volley', cost: 1000, modifiers: [{ hook: 'attack', value: 30 }] },
      [{ hook: 'attack', value: 10 }],
    );
    const state = gameWith(ruleset, ['=='], tanks, 1500);
    const tank = unitAt(state, 0, 0).id;
    expect(previewAttack(ruleset, state, tank, 0, 1)!.min).toBe(66);

    const result = apply(state, ACTIVATE, ruleset);
    expect(result.events).toEqual([{ type: 'PowerActivated', player: 0 }]);
    expect(result.state.players[0]).toMatchObject({ power: 500, powerActive: true });
    expect(previewAttack(ruleset, result.state, tank, 0, 1)!.min).toBe(84);
  });

  it("lasts through the enemy's turn and ends as its owner's next turn starts", () => {
    const ruleset = rulesWith({
      name: 'Hold',
      cost: 1000,
      modifiers: [{ hook: 'defence', value: 50 }],
    });
    const state = apply(gameWith(ruleset, ['=='], tanks), ACTIVATE, ruleset).state;
    const enemyTurn = apply(state, END_TURN, ruleset).state;
    expect(enemyTurn.players[0]!.powerActive).toBe(true);
    // 60 base against a defence factor of 200 - 150.
    const enemy = unitAt(enemyTurn, 1, 0).id;
    expect(previewAttack(ruleset, enemyTurn, enemy, 1, 0)!.min).toBe(30);

    const nextTurn = apply(enemyTurn, END_TURN, ruleset).state;
    expect(nextTurn.players[0]!.powerActive).toBe(false);
    expect(previewAttack(ruleset, nextTurn, enemy, 1, 0)!.min).toBe(60);
  });
});

describe('power effects', () => {
  const units: PlacedUnit[] = [
    { x: 0, y: 0, type: 'infantry', owner: 0 },
    { x: 1, y: 0, type: 'tank', owner: 0 },
    { x: 2, y: 0, type: 'infantry', owner: 0 },
    { x: 3, y: 0, type: 'infantry', owner: 1 },
  ];

  const wounded = (ruleset: CompiledRuleset, rows = ['....']) => {
    let state = gameWith(ruleset, rows, units);
    for (const id of Object.keys(state.units)) {
      state = withUnit(state, Number(id), { hp: 50, fuel: 10, ammo: 0 });
    }
    return withUnit(state, unitAt(state, 2, 0).id, { hp: 90 });
  };

  it('heal the units they name, for free and never above full HP', () => {
    const ruleset = rulesWith({
      name: 'Mend',
      cost: 1000,
      modifiers: [],
      effects: [{ kind: 'heal', hp: 30, units: ['foot'] }],
    });
    const state = apply(wounded(ruleset), ACTIVATE, ruleset).state;
    expect(unitAt(state, 0, 0).hp).toBe(80);
    expect(unitAt(state, 1, 0).hp).toBe(50);
    expect(unitAt(state, 2, 0).hp).toBe(100);
    expect(unitAt(state, 3, 0).hp).toBe(50);
    expect(state.players[0]!.funds).toBe(0);
  });

  it('resupply every unit of their side', () => {
    const ruleset = rulesWith({
      name: 'Restock',
      cost: 1000,
      modifiers: [],
      effects: [{ kind: 'resupply' }],
    });
    const state = apply(wounded(ruleset), ACTIVATE, ruleset).state;
    expect(unitAt(state, 1, 0)).toMatchObject({ fuel: 70, ammo: 2 });
    expect(unitAt(state, 0, 0).fuel).toBe(99);
    expect(unitAt(state, 3, 0).fuel).toBe(10);
  });

  it("pay a share of a day's income, counting the power's own modifiers", () => {
    const windfall = (modifiers: RawModifier[]) => {
      const ruleset = rulesWith({
        name: 'Windfall',
        cost: 1000,
        modifiers,
        effects: [{ kind: 'funds', incomePercent: 100 }],
      });
      const state = gameWith(ruleset, ['Rc.b']);
      return apply(state, ACTIVATE, ruleset).state.players[0]!.funds - state.players[0]!.funds;
    };
    expect(windfall([])).toBe(2000);
    expect(windfall([{ hook: 'income', value: 50 }])).toBe(3000);
  });
});

describe('power definitions', () => {
  it('need a positive cost and selectors that name units', () => {
    expect(() => rulesWith({ name: 'Free', cost: 0, modifiers: [] })).toThrow(
      /power cost must be positive/,
    );
    expect(() =>
      rulesWith({
        name: 'Mend',
        cost: 1000,
        modifiers: [],
        effects: [{ kind: 'heal', hp: 10, units: ['dragon'] }],
      }),
    ).toThrow(/Commander "test" power.*"dragon" matches no unit/);
    expect(() =>
      rulesWith({
        name: 'Bad',
        cost: 1000,
        modifiers: [{ hook: 'regen', units: ['x'], value: 1 }],
      }),
    ).toThrow(/"x" matches no unit/);
  });
});

describe('powers in saved games', () => {
  it('replay from the log, active power included', () => {
    const ruleset = rulesWith({
      name: 'Mend',
      cost: 100,
      modifiers: [{ hook: 'defence', value: 20 }],
      effects: [{ kind: 'heal', hp: 10 }],
    });
    const map = makeMap(SCRIPT_ROWS);
    const setup = {
      seed: 42,
      players: [
        { controller: 'local', commander: 'test' },
        { controller: 'local', commander: 'test' },
      ],
    } as const;
    // Player 1's infantry attacks with action 7, charging both meters past 100,
    // then activates its power and ends the turn with it still in effect.
    const actions = [...scriptedActions().slice(0, 8), ACTIVATE, END_TURN];
    const state = replay(ruleset, createGame(ruleset, map, setup), actions);
    expect(state.activePlayer).toBe(0);
    expect(state.players[1]!.powerActive).toBe(true);

    const save = JSON.parse(
      JSON.stringify(createSave(ruleset, { map, setup, actions, state }, '2026-11-26T00:00:00Z')),
    ) as SaveData;
    expect(restoreSave(ruleset, save).state).toEqual(state);
  });
});
