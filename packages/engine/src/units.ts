import { modifiersOf } from './commanders';
import type { CompiledRuleset } from './ruleset';
import type { GameState, PlayerIndex, TileIndex, Unit } from './types';

/** Displayed HP pips (1..10 with default rules) for an internal HP value. */
export function hpPips(ruleset: CompiledRuleset, hp: number): number {
  return Math.ceil(hp / ruleset.rules.hpPerPip);
}

export function maxPips(ruleset: CompiledRuleset): number {
  return ruleset.rules.maxHp / ruleset.rules.hpPerPip;
}

/** Move points of a unit type for a player, after commander modifiers. Never negative. */
export function movePointsOf(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
  unitType: number,
): number {
  const points =
    ruleset.units[unitType]!.movePoints + modifiersOf(ruleset, state, player).movement[unitType]!;
  return points > 0 ? points : 0;
}

/** Movement budget this turn: move points with commander bonus, capped by fuel. */
export function moveBudget(ruleset: CompiledRuleset, state: GameState, unit: Unit): number {
  const points = movePointsOf(ruleset, state, unit.owner, unit.type);
  return points < unit.fuel ? points : unit.fuel;
}

/** Build cost of a unit type for a player, after commander cost modifiers. */
export function unitCost(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
  unitType: number,
): number {
  const percent = modifiersOf(ruleset, state, player).cost[unitType]!;
  return Math.floor((ruleset.units[unitType]!.cost * percent) / 100);
}

/**
 * Furthest a unit type can fire for a player, after commander range modifiers.
 * The minimum range never changes, and the maximum never drops below it.
 */
export function maxRangeOf(
  ruleset: CompiledRuleset,
  state: GameState,
  player: PlayerIndex,
  unitType: number,
): number {
  const def = ruleset.units[unitType]!;
  const range = def.maxRange + modifiersOf(ruleset, state, player).range[unitType]!;
  return range > def.minRange ? range : def.minRange;
}

/**
 * Capture points `unit` removes from a property per turn: its displayed HP,
 * scaled by its commander's capture modifier, and always at least 1.
 */
export function captureAmount(ruleset: CompiledRuleset, state: GameState, unit: Unit): number {
  const percent = modifiersOf(ruleset, state, unit.owner).capture[unit.type]!;
  const amount = Math.floor((hpPips(ruleset, unit.hp) * percent) / 100);
  return amount > 1 ? amount : 1;
}

/** Funds `player` collects at the start of a turn from the properties they own. */
export function incomeOf(ruleset: CompiledRuleset, state: GameState, player: PlayerIndex): number {
  let properties = 0;
  const owner = state.owner;
  for (let tile = 0; tile < owner.length; tile++) {
    if (owner[tile] === player) properties++;
  }
  const percent = modifiersOf(ruleset, state, player).income;
  const income = Math.floor((properties * state.incomePerProperty * percent) / 100);
  return income > 0 ? income : 0;
}

/** Defence stars a unit of `unitType` gets from the terrain on `tile`. */
export function defenceStars(
  ruleset: CompiledRuleset,
  state: GameState,
  unitType: number,
  tile: TileIndex,
): number {
  if (ruleset.units[unitType]!.ignoresTerrainDefence) return 0;
  return ruleset.terrain[state.terrain[tile]!]!.defence;
}

export function isIndirect(ruleset: CompiledRuleset, unitType: number): boolean {
  return ruleset.units[unitType]!.maxRange > 1;
}

export function isArmed(ruleset: CompiledRuleset, unitType: number): boolean {
  return ruleset.units[unitType]!.maxRange > 0;
}
