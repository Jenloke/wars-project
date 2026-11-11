import { describe, expect, it } from 'vitest';
import { UNREACHABLE, computeMoveField, createMoveField, pathTo } from '../src/index';
import { apply, at, makeGame, reject, rules, unitAt, withUnit } from './fixtures';

function fieldFor(state: ReturnType<typeof makeGame>, x: number, y: number) {
  const field = createMoveField(state.width * state.height);
  return computeMoveField(rules, state, unitAt(state, x, y).id, field);
}

describe('movement range', () => {
  it('reaches a diamond of radius 3 for infantry on open plains', () => {
    const rows = Array.from({ length: 7 }, () => '.......');
    const state = makeGame(rows, [{ x: 3, y: 3, type: 'infantry', owner: 0 }]);
    const field = fieldFor(state, 3, 3);
    const reachable = field.cost.filter((cost) => cost !== UNREACHABLE).length;
    expect(reachable).toBe(25);
    expect(field.cost[at(state, 3, 0)]).toBe(3);
    expect(field.cost[at(state, 0, 0)]).toBe(UNREACHABLE);
  });

  it('applies terrain costs per move type and stops at impassable terrain', () => {
    const state = makeGame(['..F.M..'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const field = fieldFor(state, 0, 0);
    expect(field.cost[1]).toBe(1);
    expect(field.cost[2]).toBe(3); // forest costs treads 2
    expect(field.cost[3]).toBe(4);
    expect(field.cost[4]).toBe(UNREACHABLE); // mountain
    expect(field.cost[5]).toBe(UNREACHABLE);
  });

  it('lets infantry climb mountains at cost 2', () => {
    const state = makeGame(['.M..'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }]);
    const field = fieldFor(state, 0, 0);
    expect(field.cost[1]).toBe(2);
    expect(field.cost[2]).toBe(3);
    expect(field.cost[3]).toBe(UNREACHABLE);
  });

  it('takes the cheaper way around expensive terrain', () => {
    const state = makeGame(['.F.', '...'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const field = fieldFor(state, 0, 0);
    // Straight through the forest costs 3; around it costs 4. Both are found.
    expect(field.cost[at(state, 2, 0)]).toBe(3);
    expect(field.cost[at(state, 2, 1)]).toBe(3);
  });

  it('is limited by remaining fuel', () => {
    const base = makeGame(['.......'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const state = withUnit(base, unitAt(base, 0, 0).id, { fuel: 2 });
    const field = fieldFor(state, 0, 0);
    expect(field.cost[2]).toBe(2);
    expect(field.cost[3]).toBe(UNREACHABLE);
  });

  it('is blocked by enemy units', () => {
    const state = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const field = fieldFor(state, 0, 0);
    expect(field.cost[1]).toBe(UNREACHABLE);
    expect(field.cost[2]).toBe(UNREACHABLE);
  });

  it('passes through friendly units but cannot stop on them', () => {
    const state = makeGame(
      ['.....'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 1, y: 0, type: 'tank', owner: 0 },
      ],
    );
    const field = fieldFor(state, 0, 0);
    expect(field.cost[2]).toBe(2);
    const id = unitAt(state, 0, 0).id;
    expect(reject(state, { type: 'Move', unit: id, path: [1] })).toMatch(/occupied/);
    expect(apply(state, { type: 'Move', unit: id, path: [1, 2] }).state.occupant[2]).toBe(id);
  });

  it('reconstructs the cheapest path', () => {
    const state = makeGame(['.F.', '...'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const field = fieldFor(state, 0, 0);
    expect(pathTo(field, at(state, 2, 1), [])).toEqual([at(state, 0, 1), at(state, 1, 1), 5]);
    expect(pathTo(field, at(state, 0, 0), [])).toEqual([]);
  });
});

describe('Move action', () => {
  it('moves the unit, spends fuel and marks it as moved', () => {
    const state = makeGame(['..F..'], [{ x: 0, y: 0, type: 'tank', owner: 0 }]);
    const id = unitAt(state, 0, 0).id;
    const next = apply(state, { type: 'Move', unit: id, path: [1, 2, 3] }).state;
    const unit = next.units[id]!;
    expect(unit.pos).toBe(3);
    expect(unit.fuel).toBe(70 - 4);
    expect(unit.moved).toBe(true);
    expect(next.occupant[0]).toBe(-1);
    expect(next.occupant[3]).toBe(id);
  });

  it('rejects illegal paths and units', () => {
    const state = makeGame(
      ['.......', '~~~~~~~'],
      [
        { x: 0, y: 0, type: 'infantry', owner: 0 },
        { x: 6, y: 0, type: 'infantry', owner: 1 },
      ],
    );
    const mine = unitAt(state, 0, 0).id;
    const theirs = unitAt(state, 6, 0).id;
    expect(reject(state, { type: 'Move', unit: mine, path: [2] })).toMatch(/contiguous/);
    expect(reject(state, { type: 'Move', unit: mine, path: [1, 2, 3, 4] })).toMatch(/range/);
    expect(reject(state, { type: 'Move', unit: mine, path: [7] })).toMatch(/impassable/);
    expect(reject(state, { type: 'Move', unit: mine, path: [-1] })).toMatch(/map/);
    expect(reject(state, { type: 'Move', unit: theirs, path: [5] })).toMatch(/another player/);
    expect(reject(state, { type: 'Move', unit: 999, path: [] })).toMatch(/does not exist/);

    const moved = apply(state, { type: 'Move', unit: mine, path: [1] }).state;
    expect(reject(moved, { type: 'Move', unit: mine, path: [2] })).toMatch(/already acted/);
  });
});
