/**
 * What a unit is trying to do this turn when it is not attacking or capturing.
 *
 * - `capture`: walk to the property it has been assigned.
 * - `fight`: close in on enemies it can hurt (direct fire).
 * - `artillery`: reach a tile from which enemies will be in range (indirect fire).
 * - `retreat`: return to an owned property to repair and resupply.
 * - `support`: stay next to friendly units (supply carriers).
 * - `march`: head for enemy property when there is nothing else to do.
 * - `hold`: nowhere to go, but standing on a base that should be left free.
 */
export type Role = 'capture' | 'fight' | 'artillery' | 'retreat' | 'support' | 'march' | 'hold';

/**
 * Tuning for the computer opponent. These are play-style heuristics, not game
 * rules, so they live here rather than in the ruleset: changing them changes how
 * the AI plays, never what an action log replays to.
 *
 * Everything is measured in funds. A unit is worth its build cost, damage is worth
 * the share of that cost it removes, and a property is worth days of income.
 */
export interface AiProfile {
  /** Worth of one full move of progress toward the unit's goal, as a share of its cost. */
  readonly progress: Readonly<Record<Role, number>>;
  /** Share of the expected loss to enemy fire counted against standing on a tile. */
  readonly danger: Readonly<Record<Role, number>>;
  /** Bounds of the caution multiplier on danger, set by the army value ratio. */
  readonly minCaution: number;
  readonly maxCaution: number;
  /** Worth of each defence star under a unit, as a share of its cost. */
  readonly terrainStar: number;
  /** Share of a counterattack's value credited back when judging danger. */
  readonly counterCredit: number;
  /** Share of the threat from each enemy in range beyond the most dangerous one. */
  readonly extraAttackers: number;

  /** Bonus for destroying the target, as a share of its cost. */
  readonly killBonus: number;
  /** Share of the danger at the attack position counted against an attack. */
  readonly attackExposure: number;
  /** Share of a property's value earned by stopping an enemy capturing it. */
  readonly captureBreak: number;

  /** Days of income a captured property is worth. */
  readonly captureIncomeDays: number;
  /** Extra days of income for a property that builds units. */
  readonly productionBonusDays: number;
  /** Extra days of income for an HQ that is not captured this turn. */
  readonly hqBonusDays: number;
  /** Multiplier for taking a property from an enemy instead of from neutral. */
  readonly enemyPropertyFactor: number;
  /** Share of a property's value earned per share of its capture points removed. */
  readonly captureProgress: number;
  /** Share of the danger on a property counted against capturing it. */
  readonly captureExposure: number;
  /** Worth of an action that wins the game, or of stopping one that would lose it. */
  readonly winValue: number;
  /** Income assumed per property when a map pays none, so properties keep a value. */
  readonly minIncome: number;

  /** How many turns of walking each kind of property is worth when assigning capturers. */
  readonly hqPriority: number;
  readonly basePriority: number;
  readonly enemyPropertyPriority: number;

  /** HP pips at or below which a unit goes back to repair. */
  readonly retreatPips: number;
  /** Share of fuel at or below which a unit goes back to resupply. */
  readonly lowFuel: number;
  /**
   * Fuel an aircraft or ship keeps beyond what the trip home and the days on the
   * way will use, so it turns back before it can crash or sink.
   */
  readonly fuelReserve: number;
  /** Cost, in days of income, of ending a move on a base that could build. */
  readonly blockBaseDays: number;
  /** Worth, in days of income, of standing on an own HQ an enemy capturer can reach. */
  readonly guardHqDays: number;
  /** Base damage below which a unit does not go looking for that target. */
  readonly minTargetDamage: number;
  /** Smallest improvement, in funds, worth spending a move on. */
  readonly minMoveGain: number;

  /** Worth of refilling a unit, as a share of its cost per share of fuel or ammo restored. */
  readonly supplyValue: number;
  /** Share of fuel or ammo below which a unit counts as needing supply. */
  readonly supplyNeed: number;

  /** Largest multiple of an even split of funds across free bases one build may spend. */
  readonly budgetShare: number;
  /** Capturing units kept in the field while properties remain unclaimed. */
  readonly maxCapturers: number;
  /** Worth, in days of income, of a new capturer while properties remain unclaimed. */
  readonly captureNeedDays: number;
  /** Share of its engagements with direct units an indirect unit gets to start. */
  readonly indirectInitiative: number;
  /** Least share of its HP a unit is assumed to lose per engagement, which caps its lifetime. */
  readonly minAttrition: number;
  /** Cost, as a share of the price, of a unit type for each share of the army it already is. */
  readonly diversity: number;
}

export const DEFAULT_PROFILE: AiProfile = {
  progress: {
    capture: 0.5,
    fight: 0.3,
    artillery: 0.3,
    retreat: 0.4,
    support: 0.3,
    march: 0.3,
    hold: 0,
  },
  danger: {
    capture: 0.6,
    fight: 0.5,
    artillery: 1.2,
    retreat: 1,
    support: 1,
    march: 0.6,
    hold: 1,
  },
  minCaution: 0.5,
  maxCaution: 1.5,
  terrainStar: 0.02,
  counterCredit: 0.5,
  extraAttackers: 0.35,

  killBonus: 0.5,
  attackExposure: 0.3,
  captureBreak: 0.5,

  captureIncomeDays: 3,
  productionBonusDays: 2,
  hqBonusDays: 10,
  enemyPropertyFactor: 1.5,
  captureProgress: 0.8,
  captureExposure: 0.3,
  winValue: 1_000_000,
  minIncome: 1000,

  hqPriority: 1.5,
  basePriority: 0.5,
  enemyPropertyPriority: 0.5,

  retreatPips: 3,
  lowFuel: 0.2,
  fuelReserve: 5,
  blockBaseDays: 1.5,
  guardHqDays: 8,
  minTargetDamage: 25,
  minMoveGain: 1,

  supplyValue: 0.25,
  supplyNeed: 0.5,

  budgetShare: 1.5,
  maxCapturers: 6,
  captureNeedDays: 3,
  indirectInitiative: 0.5,
  minAttrition: 0.05,
  diversity: 0.5,
};
