import { describe, expect, it } from 'vitest';
import {
  attackTargetsFrom,
  compileRuleset,
  computeDamage,
  createGame,
  previewAttack,
} from '../src/index';
import { apply, makeGame, makeMap, reject, rules, testRuleset, unitAt, withUnit } from './fixtures';

describe('damage formula', () => {
  it('matches hand-computed values', () => {
    // base, attack%, attackerHp, defence%, defenderHp, stars, luck
    expect(computeDamage(rules, 50, 100, 100, 100, 100, 0, 0)).toBe(50);
    expect(computeDamage(rules, 50, 100, 50, 100, 100, 0, 0)).toBe(25); // half-strength attacker
    expect(computeDamage(rules, 50, 100, 100, 100, 100, 2, 0)).toBe(40); // 2 stars, 10 pips: -20%
    expect(computeDamage(rules, 50, 100, 100, 100, 50, 2, 0)).toBe(45); // 2 stars, 5 pips: -10%
    expect(computeDamage(rules, 50, 100, 100, 100, 100, 0, 9)).toBe(59); // luck
    expect(computeDamage(rules, 50, 120, 100, 100, 100, 0, 0)).toBe(60); // +20% attack
    expect(computeDamage(rules, 50, 100, 100, 120, 100, 0, 0)).toBe(40); // +20% defence
    expect(computeDamage(rules, 50, 100, 41, 100, 100, 0, 0)).toBe(25); // 41 hp shows as 5 pips
    expect(computeDamage(rules, 1, 100, 10, 100, 100, 4, 0)).toBe(0);
  });
});

describe('direct combat', () => {
  const duel = () =>
    makeGame(
      ['====='],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 2, y: 0, type: 'infantry', owner: 1 },
      ],
    );

  it('damages the defender and takes a counterattack within the preview range', () => {
    const state = duel();
    const attackerId = unitAt(state, 0, 0).id;
    const defenderId = unitAt(state, 2, 0).id;
    const preview = previewAttack(rules, state, attackerId, 1, 2)!;
    expect(preview).toEqual({ min: 50, max: 59, counterMin: 25, counterMax: 29 });

    const next = apply(state, { type: 'Attack', unit: attackerId, path: [1], target: 2 }).state;
    const dealt = 100 - next.units[defenderId]!.hp;
    const taken = 100 - next.units[attackerId]!.hp;
    expect(dealt).toBeGreaterThanOrEqual(preview.min);
    expect(dealt).toBeLessThanOrEqual(preview.max);
    expect(taken).toBeGreaterThanOrEqual(preview.counterMin);
    expect(taken).toBeLessThanOrEqual(preview.counterMax);
    expect(next.units[attackerId]!.moved).toBe(true);
    expect(next.units[attackerId]!.pos).toBe(1);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const run = (seed: number) => {
      const state = makeGame(
        ['====='],
        [
          { x: 0, y: 0, type: 'infantry', owner: 0 },
          { x: 2, y: 0, type: 'infantry', owner: 1 },
        ],
        seed,
      );
      const id = unitAt(state, 0, 0).id;
      const next = apply(state, { type: 'Attack', unit: id, path: [1], target: 2 }).state;
      return next.units[unitAt(state, 2, 0).id]!.hp;
    };
    expect(run(7)).toBe(run(7));
    const outcomes = new Set(Array.from({ length: 40 }, (_unused, seed) => run(seed)));
    expect(outcomes.size).toBeGreaterThan(3);
  });

  it('uses terrain defence of the defender', () => {
    const state = makeGame(
      ['=F'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const preview = previewAttack(rules, state, unitAt(state, 0, 0).id, 0, 1)!;
    expect(preview.min).toBe(40);
  });

  it('spends primary ammo and falls back to the secondary weapon', () => {
    const base = makeGame(
      ['===='],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'tank', owner: 1 },
        { x: 3, y: 0, type: 'artillery', owner: 1 },
      ],
    );
    const attackerId = unitAt(base, 0, 0).id;
    const defenderId = unitAt(base, 1, 0).id;

    const fought = apply(base, { type: 'Attack', unit: attackerId, path: [], target: 1 }).state;
    expect(fought.units[attackerId]!.ammo).toBe(1);
    expect(fought.units[defenderId]!.ammo).toBe(1); // the counter spent a round too

    const dry = withUnit(base, attackerId, { ammo: 0 });
    expect(reject(dry, { type: 'Attack', unit: attackerId, path: [], target: 1 })).toMatch(
      /no weapon/,
    );
    // Out of shells, the tank still has a machine gun against soft targets.
    expect(previewAttack(rules, withUnit(dry, attackerId, { pos: 2 }), attackerId, 2, 3)!.min).toBe(
      40,
    );
  });

  it('rejects bad targets', () => {
    const state = makeGame(
      ['====='],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 0 },
        { x: 4, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const id = unitAt(state, 0, 0).id;
    expect(reject(state, { type: 'Attack', unit: id, path: [], target: 1 })).toMatch(/own unit/);
    expect(reject(state, { type: 'Attack', unit: id, path: [], target: 4 })).toMatch(/range/);
    expect(reject(state, { type: 'Attack', unit: id, path: [], target: 2 })).toMatch(/No unit/);
  });
});

describe('indirect combat', () => {
  const setup = () =>
    makeGame(
      ['======'],
      [
        { x: 0, y: 0, type: 'artillery', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
        { x: 2, y: 0, type: 'tank', owner: 1 },
      ],
    );

  it('fires without being countered', () => {
    const state = setup();
    const id = unitAt(state, 0, 0).id;
    const next = apply(state, { type: 'Attack', unit: id, path: [], target: 2 }).state;
    expect(next.units[id]!.hp).toBe(100);
    expect(next.units[id]!.ammo).toBe(8);
    expect(next.units[unitAt(state, 2, 0).id]!.hp).toBeLessThanOrEqual(30);
  });

  it('cannot hit adjacent units or fire after moving', () => {
    const state = setup();
    const id = unitAt(state, 0, 0).id;
    expect(reject(state, { type: 'Attack', unit: id, path: [], target: 1 })).toMatch(/range/);
    const open = makeGame(
      ['======'],
      [
        { x: 0, y: 0, type: 'artillery', owner: 0 },
        { x: 4, y: 0, type: 'tank', owner: 1 },
      ],
    );
    const openId = unitAt(open, 0, 0).id;
    expect(reject(open, { type: 'Attack', unit: openId, path: [1], target: 4 })).toMatch(
      /Indirect/,
    );
    expect(attackTargetsFrom(rules, open, open.units[openId]!, 1, true)).toEqual([]);
    expect(attackTargetsFrom(rules, open, open.units[openId]!, 1, false)).toEqual([4]);
  });

  it('cannot counter a direct attack', () => {
    const state = makeGame(
      ['=='],
      [
        { x: 0, y: 0, type: 'tank', owner: 0 },
        { x: 1, y: 0, type: 'artillery', owner: 1 },
      ],
    );
    const id = unitAt(state, 0, 0).id;
    expect(previewAttack(rules, state, id, 0, 1)).toMatchObject({ counterMin: 0, counterMax: 0 });
    const next = apply(state, { type: 'Attack', unit: id, path: [], target: 1 }).state;
    expect(next.units[id]!.hp).toBe(100);
  });
});

describe('commander modifiers', () => {
  it('apply attack, movement and cost hooks from data', () => {
    const compiled = compileRuleset(testRuleset);
    const map = makeMap(
      ['=====', 'R...b'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const state = createGame(compiled, map, {
      seed: 1,
      players: [{ controller: 'local', commander: 'striker' }, { controller: 'local' }],
    });
    const id = unitAt(state, 0, 0).id;
    expect(previewAttack(compiled, state, id, 0, 1)!.min).toBe(60);

    const striker = compiled.commanders[1]!;
    expect(striker.movement[compiled.unitIndex.get('infantry')!]).toBe(1);
    expect(striker.movement[compiled.unitIndex.get('tank')!]).toBe(0);
    expect(striker.cost[compiled.unitIndex.get('tank')!]).toBe(90);
  });
});
