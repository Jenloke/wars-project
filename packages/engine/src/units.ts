import type { CompiledRuleset } from './ruleset';
import type { GameState, PlayerIndex, Unit } from './types';

/** Displayed HP pips (1..10 with default rules) for an internal HP value. */
export function hpPips(ruleset: CompiledRuleset, hp: number): number {
  return Math.ceil(hp / ruleset.rules.hpPerPip);
}

export function maxPips(ruleset: CompiledRuleset): number {
  return ruleset.rules.maxHp / ruleset.rules.hpPerPip;
}

/** Movement budget this turn: move points with commander bonus, capped by fuel. */
export function moveBudget(ruleset: CompiledRuleset, state: GameState, unit: Unit): number {
  const commander = ruleset.commanders[state.players[unit.owner]!.commander]!;
  const points = ruleset.units[unit.type]!.movePoints + commander.movement[unit.type]!;
  return points < unit.fuel ? points : unit.fuel;
}

/** Build cost of a unit type for a player, after commander cost modifiers. */
export function unitCost(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
  unitType: number,
): number {
  const commander = ruleset.commanders[state.players[player]!.commander]!;
  return Math.floor((ruleset.units[unitType]!.cost * commander.cost[unitType]!) / 100);
}

export function isIndirect(ruleset: CompiledRuleset, unitType: number): boolean {
  return ruleset.units[unitType]!.maxRange > 1;
}

export function isArmed(ruleset: CompiledRuleset, unitType: number): boolean {
  return ruleset.units[unitType]!.maxRange > 0;
}
