import {
  DEFAULT_CHARGE,
  DIRECT_UNITS,
  INDIRECT_UNITS,
  type RawCharge,
  type RawModifier,
  type RawPowerEffect,
  type RawRuleset,
  type UnitSelector,
} from '@tactics/engine';

/**
 * Plain-language descriptions of commanders, written from their rules data so
 * the text can never drift from what the engine does. A new commander is
 * described with no extra work.
 */

export type ChargeSource = keyof RawCharge;

/** How fast a meter source fills, compared with `REFERENCE_CHARGE`. */
export type ChargePace = 'fast' | 'steady' | 'slow' | 'none';

export interface ChargeLine {
  readonly source: ChargeSource;
  readonly label: string;
  readonly pace: ChargePace;
}

export interface PowerSummary {
  readonly name: string;
  readonly cost: number;
  readonly lines: readonly string[];
}

export interface CommanderSummary {
  readonly name: string;
  /** What the innate modifiers do, one line each. Empty for a plain commander. */
  readonly innate: readonly string[];
  readonly power: PowerSummary | null;
  /** Every meter source, in a fixed order, with how fast it fills. */
  readonly charge: readonly ChargeLine[];
}

/**
 * A middle-of-the-road set of charge rates. Paces are read against it, so a
 * commander "charges fast" from a source it earns well above this rate.
 */
export const REFERENCE_CHARGE: RawCharge = {
  damageDealt: 50,
  damageTaken: 50,
  kills: 25,
  captures: 1500,
  income: 10,
};

const CHARGE_LABELS: Readonly<Record<ChargeSource, string>> = {
  damageDealt: 'Dealing damage',
  damageTaken: 'Taking damage',
  kills: 'Destroying units',
  captures: 'Capturing',
  income: 'Collecting income',
};

/** Names for unit groups that selectors use. Unit IDs use the unit's name. */
const GROUP_LABELS: Readonly<Record<string, string>> = {
  [DIRECT_UNITS]: 'Direct-fire units',
  [INDIRECT_UNITS]: 'Indirect-fire units',
  ground: 'Ground units',
  infantry: 'Infantry',
  vehicle: 'Vehicles',
  naval: 'Ships',
  air: 'Aircraft',
  copter: 'Copters',
  plane: 'Planes',
};

const ALL_UNITS = 'All units';
const MINUS = '−';

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${MINUS}${-value}`;
}

function pace(rate: number, reference: number): ChargePace {
  if (rate <= 0) return 'none';
  const ratio = rate / reference;
  if (ratio >= 1.5) return 'fast';
  if (ratio >= 0.75) return 'steady';
  return 'slow';
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]!}`;
}

class Describer {
  constructor(private readonly ruleset: RawRuleset) {}

  /** Internal HP as displayed HP, such as "3" or "1.5". */
  hp(internal: number): string {
    const pips = internal / this.ruleset.rules.hpPerPip;
    return Number.isInteger(pips) ? String(pips) : pips.toFixed(1);
  }

  selectorLabel(selector: UnitSelector): string {
    const group = GROUP_LABELS[selector];
    if (group !== undefined) return group;
    const unit = this.ruleset.units.find((candidate) => candidate.id === selector);
    if (unit !== undefined) return unit.name;
    if (this.ruleset.moveTypes.includes(selector)) return `${capitalise(selector)} units`;
    return capitalise(selector);
  }

  scope(units: readonly UnitSelector[] | undefined, fallback = ALL_UNITS): string {
    if (units === undefined || units.length === 0) return fallback;
    return joinLabels(units.map((selector) => this.selectorLabel(selector)));
  }

  modifier(modifier: RawModifier): string {
    const { value } = modifier;
    const scope = this.scope(modifier.units);
    switch (modifier.hook) {
      case 'attack':
        return `${scope}: ${signed(value)}% firepower`;
      case 'defence':
        return `${scope}: ${signed(value)}% defence`;
      case 'movement':
        return `${scope}: ${signed(value)} movement`;
      case 'cost':
        return `${scope}: cost ${Math.abs(value)}% ${value < 0 ? 'less' : 'more'} to build and repair`;
      case 'range':
        return `${this.scope(modifier.units, GROUP_LABELS[INDIRECT_UNITS])}: ${signed(value)} range`;
      case 'capture':
        return `${scope}: ${signed(value)}% capture speed`;
      case 'repair':
        return `${scope}: ${signed(Number(this.hp(value)))} HP repaired on properties`;
      case 'regen':
        return value >= 0
          ? `${scope}: recover ${this.hp(value)} HP each turn, anywhere, for free`
          : `${scope}: lose ${this.hp(-value)} HP each turn`;
      case 'income':
        return `${signed(value)}% income from properties`;
      default: {
        const unknown: never = modifier.hook;
        return String(unknown);
      }
    }
  }

  effect(effect: RawPowerEffect): string {
    switch (effect.kind) {
      case 'heal':
        return `${this.scope(effect.units)}: heal ${this.hp(effect.hp)} HP at once, for free`;
      case 'resupply':
        return `${this.scope(effect.units)}: refill fuel and ammo at once`;
      case 'funds':
        return effect.incomePercent === 100
          ? "Collect a day's income at once"
          : `Collect ${effect.incomePercent}% of a day's income at once`;
      default: {
        const unknown: never = effect;
        return String(unknown);
      }
    }
  }
}

/** Describes commander `id` of `ruleset`. Throws for an unknown ID. */
export function describeCommander(ruleset: RawRuleset, id: string): CommanderSummary {
  const commander = ruleset.commanders.find((candidate) => candidate.id === id);
  if (commander === undefined) throw new Error(`Unknown commander "${id}"`);
  const text = new Describer(ruleset);
  const charge = commander.charge ?? DEFAULT_CHARGE;
  const power = commander.power;
  return {
    name: commander.name,
    innate: commander.modifiers.map((modifier) => text.modifier(modifier)),
    power:
      power === undefined
        ? null
        : {
            name: power.name,
            cost: power.cost,
            lines: [
              ...(power.effects ?? []).map((effect) => text.effect(effect)),
              ...power.modifiers.map((modifier) => text.modifier(modifier)),
            ],
          },
    charge: (Object.keys(CHARGE_LABELS) as ChargeSource[]).map((source) => ({
      source,
      label: CHARGE_LABELS[source],
      pace: pace(charge[source], REFERENCE_CHARGE[source]),
    })),
  };
}
