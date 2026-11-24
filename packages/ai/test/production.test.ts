import { NO_DAMAGE, weaponBaseDamage, type Action, type GameState } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { readBoard } from '../src/board';
import { makePlan } from '../src/plan';
import { findBuild } from '../src/production';
import { DEFAULT_PROFILE } from '../src/profile';
import { makeGame, rules, unitType } from './fixtures';

function build(state: GameState): Extract<Action, { type: 'Build' }> {
  const board = readBoard(rules, state, DEFAULT_PROFILE);
  const action = findBuild(board, makePlan(board));
  if (action?.type !== 'Build') throw new Error('Expected a build');
  return action;
}

function base(attacker: number, defender: number): number {
  const damage = weaponBaseDamage(rules, attacker, rules.units[attacker]!.maxAmmo, defender);
  return damage === NO_DAMAGE ? 0 : damage;
}

const tank = unitType('tank');
const infantry = unitType('infantry');

describe('production', () => {
  it('builds capturers while neutral properties are unclaimed', () => {
    const state = makeGame(['R.C.C.C', '.......'], [], [5000, 0]);
    expect(rules.units[build(state).unitType]!.canCapture).toBe(true);
  });

  it('builds something that beats tanks against a tank army', () => {
    const state = makeGame(
      ['R.......', '........'],
      [
        { x: 7, y: 0, type: 'tank', owner: 1 },
        { x: 7, y: 1, type: 'tank', owner: 1 },
        { x: 6, y: 1, type: 'tank', owner: 1 },
      ],
      [8000, 0],
    );
    const built = build(state).unitType;
    expect(base(built, tank)).toBeGreaterThanOrEqual(45);
    expect(built).not.toBe(infantry);
  });

  it('builds something that beats infantry, and that infantry cannot hurt, against infantry', () => {
    const state = makeGame(
      ['R.......', '........'],
      [
        { x: 7, y: 0, type: 'infantry', owner: 1 },
        { x: 7, y: 1, type: 'infantry', owner: 1 },
        { x: 6, y: 1, type: 'infantry', owner: 1 },
        { x: 6, y: 0, type: 'infantry', owner: 1 },
      ],
      [8000, 0],
    );
    const built = build(state).unitType;
    expect(base(built, infantry)).toBeGreaterThanOrEqual(65);
    expect(base(infantry, built)).toBeLessThanOrEqual(20);
  });

  it('spends more on one unit when the funds would otherwise sit idle', () => {
    const army = [
      { x: 7, y: 0, type: 'tank', owner: 1 },
      { x: 7, y: 1, type: 'tank', owner: 1 },
    ];
    const poor = build(makeGame(['R.......', '........'], army, [3000, 0])).unitType;
    const rich = build(makeGame(['R.......', '........'], army, [40000, 0])).unitType;
    expect(rules.units[rich]!.cost).toBeGreaterThan(rules.units[poor]!.cost);
  });

  it('splits funds between free bases instead of emptying them on the first', () => {
    const state = makeGame(
      ['RR......', '........'],
      [{ x: 7, y: 0, type: 'tank', owner: 1 }],
      [9000, 0],
    );
    // One base could take a 9000 unit, but that would leave the other idle.
    expect(rules.units[build(state).unitType]!.cost).toBeLessThanOrEqual(6750);
  });

  it('builds nothing without a free base or the funds for the cheapest unit', () => {
    const board = (state: GameState) => readBoard(rules, state, DEFAULT_PROFILE);
    const broke = makeGame(['R.'], [], [500, 0]);
    expect(findBuild(board(broke), makePlan(board(broke)))).toBeNull();
    const blocked = makeGame(['R.'], [{ x: 0, y: 0, type: 'infantry', owner: 0 }], [9000, 0]);
    expect(findBuild(board(blocked), makePlan(board(blocked)))).toBeNull();
  });
});
