import { describe, expect, it } from 'vitest';
import {
  compileRuleset,
  createGame,
  DEFAULT_CHARGE,
  type CompiledRuleset,
  type GameEvent,
  type GameState,
  type RawCharge,
  type RawModifier,
} from '../src/index';
import { apply, makeMap, testRuleset, unitAt, withUnit, type PlacedUnit } from './fixtures';

const END_TURN = { type: 'EndTurn' } as const;
const TANK_COST = 7000;

/** Charge rates with every source off except those given. */
function rates(charge: Partial<RawCharge>): RawCharge {
  return { damageDealt: 0, damageTaken: 0, kills: 0, captures: 0, income: 0, ...charge };
}

/** The test ruleset plus a commander `test` with these rates and a power costing `cost`. */
function rulesCharging(
  charge: RawCharge,
  cost = 100_000,
  modifiers: readonly RawModifier[] = [],
): CompiledRuleset {
  return compileRuleset({
    ...testRuleset,
    commanders: [
      ...testRuleset.commanders,
      { id: 'test', name: 'Test', modifiers, charge, power: { name: 'P', cost, modifiers: [] } },
    ],
  });
}

/** Player 0 led by `commander` (null for the default), player 1 by the default. */
function gameWith(
  ruleset: CompiledRuleset,
  rows: readonly string[],
  units: readonly PlacedUnit[] = [],
  commander: string | null = 'test',
): GameState {
  return createGame(ruleset, makeMap(rows, units), {
    seed: 3,
    players: [{ controller: 'local', commander: commander ?? undefined }, { controller: 'local' }],
  });
}

/** Damage of the first strike and of the counter, from an attack's events. */
function strikes(events: readonly GameEvent[]): { hit: number; counter: number } {
  let hit = 0;
  let counter = 0;
  for (const event of events) {
    if (event.type !== 'Attacked') continue;
    if (event.isCounter) counter = event.damage;
    else hit = event.damage;
  }
  return { hit, counter };
}

const tanks: PlacedUnit[] = [
  { x: 0, y: 0, type: 'tank', owner: 0 },
  { x: 1, y: 0, type: 'tank', owner: 1 },
];

function tankDuel(ruleset: CompiledRuleset, commander: string | null = 'test') {
  const state = gameWith(ruleset, ['=='], tanks, commander);
  const attack = { type: 'Attack', unit: unitAt(state, 0, 0).id, path: [], target: 1 } as const;
  const result = apply(state, attack, ruleset);
  const { hit, counter } = strikes(result.events);
  return {
    players: result.state.players,
    hitValue: Math.floor((TANK_COST * hit) / 100),
    counterValue: Math.floor((TANK_COST * counter) / 100),
  };
}

describe('the power meter', () => {
  it('fills by default as it always has: all of the damage taken, half of what is dealt', () => {
    expect(DEFAULT_CHARGE).toEqual(rates({ damageDealt: 50, damageTaken: 100 }));
    const ruleset = compileRuleset(testRuleset);
    const { players, hitValue, counterValue } = tankDuel(ruleset, null);
    expect(hitValue).toBeGreaterThan(0);
    expect(counterValue).toBeGreaterThan(0);
    expect(players[0]!.power).toBe(Math.floor(hitValue / 2) + counterValue);
    expect(players[1]!.power).toBe(hitValue + Math.floor(counterValue / 2));
  });

  it("charges damage dealt and taken at each commander's own rates", () => {
    const ruleset = rulesCharging(rates({ damageDealt: 30, damageTaken: 200 }));
    const { players, hitValue, counterValue } = tankDuel(ruleset);
    expect(players[0]!.power).toBe(Math.floor((hitValue * 30) / 100) + counterValue * 2);
    // The default commander opposite still charges at the default rates.
    expect(players[1]!.power).toBe(hitValue + Math.floor(counterValue / 2));
  });

  it('charges a share of the cost of each unit destroyed', () => {
    const ruleset = rulesCharging(rates({ kills: 50 }));
    const base = gameWith(
      ruleset,
      ['=='],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const state = withUnit(base, unitAt(base, 1, 0).id, { hp: 5 });
    const attack = { type: 'Attack', unit: unitAt(state, 0, 0).id, path: [], target: 1 } as const;
    const result = apply(state, attack, ruleset);
    expect(result.events.some((event) => event.type === 'UnitDestroyed')).toBe(true);
    expect(result.state.players[0]!.power).toBe(500);
  });

  it('charges for each property captured, not for progress', () => {
    const ruleset = rulesCharging(rates({ captures: 3000 }));
    const state = gameWith(ruleset, ['C.'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const id = unitAt(state, 0, 0).id;
    const halfway = apply(state, { type: 'Capture', unit: id, path: [] }, ruleset).state;
    expect(halfway.players[0]!.power).toBe(0);
    const round = apply(apply(halfway, END_TURN, ruleset).state, END_TURN, ruleset).state;
    const taken = apply(round, { type: 'Capture', unit: id, path: [] }, ruleset).state;
    expect(taken.owner[0]).toBe(0);
    expect(taken.players[0]!.power).toBe(3000);
  });

  it('charges a share of the income collected each turn', () => {
    const ruleset = rulesCharging(rates({ income: 25 }));
    const state = gameWith(ruleset, ['Rc.b']);
    // The opening funds are a starting stake, not income collected in a turn.
    expect(state.players[0]!.power).toBe(0);
    const round = apply(apply(state, END_TURN, ruleset).state, END_TURN, ruleset).state;
    expect(round.players[0]!.power).toBe(500);
    expect(round.players[1]!.power).toBe(0);
  });

  it('holds no more than the power costs', () => {
    const ruleset = rulesCharging(rates({ captures: 3000 }), 1000, [
      { hook: 'capture', value: 100 },
    ]);
    const state = gameWith(ruleset, ['C.'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const id = unitAt(state, 0, 0).id;
    expect(
      apply(state, { type: 'Capture', unit: id, path: [] }, ruleset).state.players[0]!.power,
    ).toBe(1000);
  });

  it('stops charging while the power is active and resumes once it ends', () => {
    const ruleset = rulesCharging(rates({ damageTaken: 100, income: 50 }), 1000);
    const base = gameWith(
      ruleset,
      ['R=b'],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const ready = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, power: 1000 } : p)),
    };
    const active = apply(ready, { type: 'ActivatePower' }, ruleset).state;
    const enemyTurn = apply(active, END_TURN, ruleset).state;
    const hit = { type: 'Attack', unit: unitAt(enemyTurn, 1, 0).id, path: [], target: 0 } as const;
    const struck = apply(enemyTurn, hit, ruleset).state;
    expect(struck.players[0]!.power).toBe(0);
    expect(struck.players[1]!.power).toBeGreaterThan(0);

    const next = apply(struck, END_TURN, ruleset).state;
    expect(next.players[0]).toMatchObject({ powerActive: false, power: 500 });
  });

  it('refuses negative charge rates', () => {
    expect(() => rulesCharging(rates({ kills: -1 }))).toThrow(/"kills" must not be negative/);
  });
});
