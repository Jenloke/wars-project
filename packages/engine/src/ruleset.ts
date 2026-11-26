/**
 * Rulesets come in two forms. `RawRuleset` is plain, string-keyed data authored in
 * the content package. `CompiledRuleset` is the same data interned to numeric
 * indices and packed into typed arrays, so engine hot paths are array lookups.
 * The compiled form lives outside `GameState`.
 */

export const IMPASSABLE = 255;
export const NO_DAMAGE = -1;

/**
 * Names a group of units in rules data. A unit matches a selector equal to its
 * id, its move type, or one of its tags, so rules can say "infantry", "tread" or
 * "copter" without listing every unit.
 */
export type UnitSelector = string;

export interface RawTransport {
  readonly capacity: number;
  /** Units this transport can carry. */
  readonly carries: readonly UnitSelector[];
}

/** A unit that can submerge (or otherwise hide) from most attackers. */
export interface RawDive {
  /** Daily fuel use while dived, in place of the unit's `fuelPerDay`. */
  readonly fuelPerDay: number;
  /** Units that can still attack it while it is dived. */
  readonly attackableBy: readonly UnitSelector[];
}

export interface RawUnitDef {
  readonly id: string;
  readonly name: string;
  readonly moveType: string;
  /** Free-form classes (such as "copter" or "naval") that selectors can name. */
  readonly tags?: readonly string[] | undefined;
  readonly movePoints: number;
  readonly cost: number;
  readonly maxFuel: number;
  /** Rounds for the primary weapon. 0 if the unit has none. */
  readonly maxAmmo: number;
  /** 0 for unarmed units. */
  readonly minRange: number;
  readonly maxRange: number;
  readonly canCapture: boolean;
  readonly canSupply: boolean;
  readonly transport?: RawTransport | undefined;
  /** Fuel used at the start of each of its owner's turns, on top of what moving costs. */
  readonly fuelPerDay?: number | undefined;
  /**
   * Destroyed at the start of its owner's turn when its tank is empty after the
   * daily use and any resupply: aircraft crash and ships sink.
   */
  readonly lostWithoutFuel?: boolean | undefined;
  /** True for units that terrain gives no cover, such as aircraft. */
  readonly ignoresTerrainDefence?: boolean | undefined;
  /** Present for units that can dive. */
  readonly dive?: RawDive | undefined;
}

export interface RawPropertyDef {
  readonly isHq: boolean;
  /** Move types repaired and resupplied here at the start of the owner's turn. */
  readonly repairs: readonly string[];
  /** Unit IDs the owner can build here. */
  readonly builds: readonly string[];
}

export interface RawTerrainDef {
  readonly id: string;
  readonly name: string;
  /** Defence stars, 0..4. */
  readonly defence: number;
  /** Cost to enter per move type. A missing move type cannot enter. */
  readonly moveCosts: Readonly<Record<string, number>>;
  readonly property?: RawPropertyDef | undefined;
}

export interface RawDamageEntry {
  readonly attacker: string;
  readonly defender: string;
  /** Base damage percent with the primary weapon (uses ammo). */
  readonly primary?: number | undefined;
  /** Base damage percent with the secondary weapon (unlimited). */
  readonly secondary?: number | undefined;
}

/**
 * What a commander modifier changes, and how its value is read:
 *
 * - `attack`, `defence`, `cost`, `capture`: percentage points added to a base of
 *   100 (firepower, damage taken, build and repair price, capture speed).
 * - `movement`: move points added.
 * - `range`: added to the maximum range of indirect units. Direct units are
 *   unaffected, and the maximum never drops below the minimum.
 * - `repair`: internal HP added to what an owned property repairs each turn,
 *   still paid for.
 * - `regen`: internal HP every unit recovers for free at the start of its
 *   owner's turn, wherever it is. Negative values wear units down, never below 1.
 * - `income`: percentage points added to a base of 100 of the funds each
 *   property pays. Applies to the player, so it takes no `units`.
 */
export type ModifierHook =
  'attack' | 'defence' | 'movement' | 'cost' | 'range' | 'capture' | 'repair' | 'regen' | 'income';

/** A commander effect as data. */
export interface RawModifier {
  readonly hook: ModifierHook;
  /** Units affected. Omit for all units. Ignored by `income`. */
  readonly units?: readonly UnitSelector[] | undefined;
  readonly value: number;
}

export interface RawCommanderDef {
  readonly id: string;
  readonly name: string;
  /** Innate modifiers, always in effect. */
  readonly modifiers: readonly RawModifier[];
}

export interface RuleConstants {
  readonly maxHp: number;
  /** Internal HP per displayed HP pip. */
  readonly hpPerPip: number;
  readonly capturePoints: number;
  /** Internal HP restored per turn on a repairing property. */
  readonly repairHp: number;
  /** Luck adds a uniform integer in `0..luckMax` to base damage. */
  readonly luckMax: number;
}

export interface RawRuleset {
  readonly id: string;
  readonly moveTypes: readonly string[];
  readonly units: readonly RawUnitDef[];
  readonly terrain: readonly RawTerrainDef[];
  readonly damage: readonly RawDamageEntry[];
  /** Index 0 must be the no-op commander. */
  readonly commanders: readonly RawCommanderDef[];
  readonly rules: RuleConstants;
}

export interface CompiledUnit {
  readonly id: string;
  readonly name: string;
  readonly moveType: number;
  readonly movePoints: number;
  readonly cost: number;
  readonly maxFuel: number;
  readonly maxAmmo: number;
  readonly minRange: number;
  readonly maxRange: number;
  readonly canCapture: boolean;
  readonly canSupply: boolean;
  readonly tags: readonly string[];
  readonly fuelPerDay: number;
  readonly lostWithoutFuel: boolean;
  readonly ignoresTerrainDefence: boolean;
  readonly canDive: boolean;
  /** Daily fuel use while dived. */
  readonly divedFuelPerDay: number;
  /** Per attacker unit type: 1 if it can attack this unit while it is dived. */
  readonly divedAttackers: Uint8Array;
  readonly capacity: number;
  /** Per unit type: 1 if this transport can carry it. */
  readonly carries: Uint8Array;
}

export interface CompiledTerrain {
  readonly id: string;
  readonly name: string;
  readonly defence: number;
  readonly isProperty: boolean;
  readonly isHq: boolean;
  /** Per move type: 1 if repaired here. */
  readonly repairs: Uint8Array;
  /** Unit type indices buildable here. */
  readonly builds: readonly number[];
}

/** A set of commander modifiers resolved to per-unit-type tables. */
export interface CompiledModifiers {
  /** Per unit type: attack percent (100 = unmodified). */
  readonly attack: Int16Array;
  /** Per unit type: defence percent (100 = unmodified). */
  readonly defence: Int16Array;
  /** Per unit type: extra move points. */
  readonly movement: Int8Array;
  /** Per unit type: cost percent (100 = unmodified). */
  readonly cost: Int16Array;
  /** Per unit type: extra maximum range. Always 0 for direct units. */
  readonly range: Int8Array;
  /** Per unit type: capture speed percent (100 = unmodified). */
  readonly capture: Int16Array;
  /** Per unit type: extra internal HP repaired on owned properties. */
  readonly repair: Int16Array;
  /** Per unit type: internal HP recovered for free at the start of each turn. */
  readonly regen: Int16Array;
  /** Income percent (100 = unmodified). */
  readonly income: number;
}

export interface CompiledCommander {
  readonly id: string;
  readonly name: string;
  /** Innate modifiers. */
  readonly passive: CompiledModifiers;
}

export interface CompiledRuleset {
  readonly id: string;
  readonly unitCount: number;
  readonly terrainCount: number;
  readonly moveTypeCount: number;
  readonly moveTypes: readonly string[];
  readonly units: readonly CompiledUnit[];
  readonly terrain: readonly CompiledTerrain[];
  readonly commanders: readonly CompiledCommander[];
  /** `[moveType * terrainCount + terrain]`, `IMPASSABLE` if it cannot enter. */
  readonly moveCost: Uint8Array;
  /** `[attacker * unitCount + defender]`, `NO_DAMAGE` if it cannot attack. */
  readonly primaryDamage: Int16Array;
  readonly secondaryDamage: Int16Array;
  readonly unitIndex: ReadonlyMap<string, number>;
  readonly terrainIndex: ReadonlyMap<string, number>;
  readonly moveTypeIndex: ReadonlyMap<string, number>;
  readonly rules: RuleConstants;
}

function internIds(ids: readonly string[], kind: string): Map<string, number> {
  const index = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as string;
    if (index.has(id)) throw new Error(`Duplicate ${kind} id "${id}"`);
    index.set(id, i);
  }
  return index;
}

function lookup(index: ReadonlyMap<string, number>, id: string, kind: string): number {
  const value = index.get(id);
  if (value === undefined) throw new Error(`Unknown ${kind} id "${id}"`);
  return value;
}

/**
 * Classes every unit belongs to by its weapons, so rules can name them without
 * tagging each unit: `direct` fires at adjacent tiles only, `indirect` reaches
 * further (and so cannot move and fire). Unarmed units are neither.
 */
export const DIRECT_UNITS: UnitSelector = 'direct';
export const INDIRECT_UNITS: UnitSelector = 'indirect';

function matches(selector: UnitSelector, unit: RawUnitDef): boolean {
  if (selector === DIRECT_UNITS) return unit.maxRange === 1;
  if (selector === INDIRECT_UNITS) return unit.maxRange > 1;
  return selector === unit.id || selector === unit.moveType || (unit.tags ?? []).includes(selector);
}

/**
 * Per unit type: 1 if any selector names it. A selector that names no unit is a
 * typo in the data, so it throws rather than silently matching nothing.
 */
export function selectUnits(
  units: readonly RawUnitDef[],
  selectors: readonly UnitSelector[],
  context: string,
): Uint8Array {
  const selected = new Uint8Array(units.length);
  for (const selector of selectors) {
    let found = false;
    units.forEach((unit, index) => {
      if (!matches(selector, unit)) return;
      selected[index] = 1;
      found = true;
    });
    if (!found) throw new Error(`${context}: "${selector}" matches no unit`);
  }
  return selected;
}

type UnitTableHook = Exclude<ModifierHook, 'income'>;
type MutableModifiers = { -readonly [K in keyof CompiledModifiers]: CompiledModifiers[K] };

function neutralModifiers(unitCount: number): MutableModifiers {
  return {
    attack: new Int16Array(unitCount).fill(100),
    defence: new Int16Array(unitCount).fill(100),
    movement: new Int8Array(unitCount),
    cost: new Int16Array(unitCount).fill(100),
    range: new Int8Array(unitCount),
    capture: new Int16Array(unitCount).fill(100),
    repair: new Int16Array(unitCount),
    regen: new Int16Array(unitCount),
    income: 100,
  };
}

/**
 * Adds `modifiers` on top of `base` (a fresh copy, so `base` is left alone).
 * Selectors that match no unit throw, as they can only be typos.
 */
function applyModifiers(
  units: readonly RawUnitDef[],
  base: CompiledModifiers,
  modifiers: readonly RawModifier[],
  context: string,
): CompiledModifiers {
  const result: MutableModifiers = {
    attack: base.attack.slice(),
    defence: base.defence.slice(),
    movement: base.movement.slice(),
    cost: base.cost.slice(),
    range: base.range.slice(),
    capture: base.capture.slice(),
    repair: base.repair.slice(),
    regen: base.regen.slice(),
    income: base.income,
  };
  for (const modifier of modifiers) {
    if (modifier.hook === 'income') {
      result.income += modifier.value;
      continue;
    }
    const hook: UnitTableHook = modifier.hook;
    const table = result[hook];
    const selected =
      modifier.units === undefined ? null : selectUnits(units, modifier.units, context);
    for (let u = 0; u < units.length; u++) {
      if (selected !== null && selected[u] !== 1) continue;
      // Range only stretches indirect fire: a direct unit firing from two tiles
      // away would break the rule that only adjacent units trade blows.
      if (hook === 'range' && !matches(INDIRECT_UNITS, units[u]!)) continue;
      table[u] = (table[u] as number) + modifier.value;
    }
  }
  return result;
}

function compileCommander(raw: RawCommanderDef, units: readonly RawUnitDef[]): CompiledCommander {
  const context = `Commander "${raw.id}"`;
  const passive = applyModifiers(units, neutralModifiers(units.length), raw.modifiers, context);
  return { id: raw.id, name: raw.name, passive };
}

/** Interns a raw ruleset into lookup tables. Throws on any dangling reference. */
export function compileRuleset(raw: RawRuleset): CompiledRuleset {
  const moveTypeIndex = internIds(raw.moveTypes, 'move type');
  const unitIndex = internIds(
    raw.units.map((u) => u.id),
    'unit',
  );
  const terrainIndex = internIds(
    raw.terrain.map((t) => t.id),
    'terrain',
  );
  const unitCount = raw.units.length;
  const terrainCount = raw.terrain.length;
  const moveTypeCount = raw.moveTypes.length;

  if (raw.commanders.length === 0) throw new Error('Ruleset needs a default commander');

  const units: CompiledUnit[] = raw.units.map((u) => {
    const carries =
      u.transport === undefined
        ? new Uint8Array(unitCount)
        : selectUnits(raw.units, u.transport.carries, `Unit "${u.id}" transport`);
    const divedAttackers =
      u.dive === undefined
        ? new Uint8Array(unitCount)
        : selectUnits(raw.units, u.dive.attackableBy, `Unit "${u.id}" dive`);
    return {
      id: u.id,
      name: u.name,
      moveType: lookup(moveTypeIndex, u.moveType, 'move type'),
      movePoints: u.movePoints,
      cost: u.cost,
      maxFuel: u.maxFuel,
      maxAmmo: u.maxAmmo,
      minRange: u.minRange,
      maxRange: u.maxRange,
      canCapture: u.canCapture,
      canSupply: u.canSupply,
      tags: u.tags ?? [],
      fuelPerDay: u.fuelPerDay ?? 0,
      lostWithoutFuel: u.lostWithoutFuel ?? false,
      ignoresTerrainDefence: u.ignoresTerrainDefence ?? false,
      canDive: u.dive !== undefined,
      divedFuelPerDay: u.dive?.fuelPerDay ?? u.fuelPerDay ?? 0,
      divedAttackers,
      capacity: u.transport?.capacity ?? 0,
      carries,
    };
  });

  const moveCost = new Uint8Array(moveTypeCount * terrainCount).fill(IMPASSABLE);
  const terrain: CompiledTerrain[] = raw.terrain.map((t, terrainIdx) => {
    for (const [mt, cost] of Object.entries(t.moveCosts)) {
      if (cost < 1 || cost >= IMPASSABLE) {
        throw new Error(`Terrain "${t.id}" has invalid move cost ${cost} for "${mt}"`);
      }
      moveCost[lookup(moveTypeIndex, mt, 'move type') * terrainCount + terrainIdx] = cost;
    }
    const repairs = new Uint8Array(moveTypeCount);
    let builds: number[] = [];
    if (t.property !== undefined) {
      for (const mt of t.property.repairs) repairs[lookup(moveTypeIndex, mt, 'move type')] = 1;
      builds = t.property.builds.map((id) => lookup(unitIndex, id, 'unit'));
    }
    return {
      id: t.id,
      name: t.name,
      defence: t.defence,
      isProperty: t.property !== undefined,
      isHq: t.property?.isHq ?? false,
      repairs,
      builds,
    };
  });

  const primaryDamage = new Int16Array(unitCount * unitCount).fill(NO_DAMAGE);
  const secondaryDamage = new Int16Array(unitCount * unitCount).fill(NO_DAMAGE);
  for (const entry of raw.damage) {
    const cell =
      lookup(unitIndex, entry.attacker, 'unit') * unitCount +
      lookup(unitIndex, entry.defender, 'unit');
    if (entry.primary !== undefined) primaryDamage[cell] = entry.primary;
    if (entry.secondary !== undefined) secondaryDamage[cell] = entry.secondary;
  }

  return {
    id: raw.id,
    unitCount,
    terrainCount,
    moveTypeCount,
    moveTypes: raw.moveTypes,
    units,
    terrain,
    commanders: raw.commanders.map((c) => compileCommander(c, raw.units)),
    moveCost,
    primaryDamage,
    secondaryDamage,
    unitIndex,
    terrainIndex,
    moveTypeIndex,
    rules: raw.rules,
  };
}
