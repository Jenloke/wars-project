import { describe, expect, it } from 'vitest';
import { computeMoveField, createMoveField, type GameState } from '../src/index';
import { apply, makeGame, rules, unitAt } from './fixtures';

/** Milliseconds allowed. Generous, so the test catches regressions, not noise. */
const RANGE_QUERY_BUDGET_MS = 500;
const ACTION_BUDGET_MS = 1500;

/** A 30 x 20 map with scattered forest, the target size for 60 fps play. */
function largeMap(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 20; y++) {
    let row = '';
    for (let x = 0; x < 30; x++) row += (x * 7 + y * 13) % 5 === 0 ? 'F' : x % 6 === 3 ? '=' : '.';
    rows.push(row);
  }
  return rows;
}

describe('performance on a 30x20 map', () => {
  it('answers 5000 movement range queries within budget', () => {
    const state = makeGame(largeMap(), [{ x: 15, y: 10, type: 'tank', owner: 0 }]);
    const id = unitAt(state, 15, 10).id;
    const field = createMoveField(state.width * state.height);

    const start = Date.now();
    for (let i = 0; i < 5000; i++) computeMoveField(rules, state, id, field);
    const elapsed = Date.now() - start;

    expect(field.cost[unitAt(state, 15, 10).pos]).toBe(0);
    expect(elapsed).toBeLessThan(RANGE_QUERY_BUDGET_MS);
  });

  it('applies 4000 actions within budget', () => {
    const placed = [];
    for (let i = 0; i < 20; i++) {
      placed.push({ x: 1, y: i, type: 'infantry', owner: 0 });
      placed.push({ x: 28, y: i, type: 'infantry', owner: 1 });
    }
    let state: GameState = makeGame(largeMap(), placed);
    const start = Date.now();
    let applied = 0;
    while (applied < 4000) {
      const side = state.activePlayer;
      const step = (state.day + side) % 2 === 0 ? 1 : -1;
      for (const unit of Object.values(state.units)) {
        if (unit.owner !== side) continue;
        state = apply(state, { type: 'Move', unit: unit.id, path: [unit.pos + step] }).state;
        applied++;
      }
      state = apply(state, { type: 'EndTurn' }).state;
      applied++;
    }
    expect(Date.now() - start).toBeLessThan(ACTION_BUDGET_MS);
  });
});
