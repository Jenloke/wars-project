import type { RawCommanderDef } from '@tactics/engine';
import { z } from 'zod';

/**
 * The commanders, in selection order. Index 0 is the default commander with no
 * abilities. Players store commanders by index, so new ones are only appended.
 */
export const commanders: readonly RawCommanderDef[] = [
  { id: 'none', name: 'Field Officer', modifiers: [] },
  {
    // Firepower. Charges from hitting hard and finishing units off.
    id: 'iska',
    name: 'Iska Varn',
    modifiers: [
      { hook: 'attack', value: 20 },
      { hook: 'defence', value: -5 },
    ],
    charge: { damageDealt: 80, damageTaken: 40, kills: 80, captures: 1000, income: 0 },
    power: { name: 'Firestorm', cost: 26000, modifiers: [{ hook: 'attack', value: 35 }] },
  },
  {
    // Defence. Charges from the blows his line absorbs.
    id: 'corvin',
    name: 'Corvin Ash',
    modifiers: [
      { hook: 'defence', value: 15 },
      { hook: 'movement', units: ['vehicle'], value: -1 },
    ],
    charge: { damageDealt: 30, damageTaken: 120, kills: 20, captures: 1000, income: 5 },
    power: { name: 'Iron Line', cost: 28000, modifiers: [{ hook: 'defence', value: 25 }] },
  },
  {
    // Economy. Charges from income and from adding properties to the books.
    id: 'odile',
    name: 'Odile Penn',
    modifiers: [
      { hook: 'income', value: 15 },
      { hook: 'attack', value: -10 },
    ],
    charge: { damageDealt: 40, damageTaken: 40, kills: 10, captures: 2500, income: 25 },
    power: {
      name: 'Windfall',
      cost: 28000,
      modifiers: [{ hook: 'cost', value: -20 }],
      effects: [{ kind: 'funds', incomePercent: 100 }],
    },
  },
  {
    // Health regeneration. Charges from wounds taken and steady upkeep.
    id: 'halden',
    name: 'Halden Moss',
    modifiers: [
      { hook: 'regen', value: 10 },
      { hook: 'repair', value: 10 },
      { hook: 'cost', value: 10 },
    ],
    charge: { damageDealt: 40, damageTaken: 90, kills: 20, captures: 1500, income: 20 },
    power: {
      name: 'Triage',
      cost: 26000,
      modifiers: [{ hook: 'defence', value: 10 }],
      effects: [{ kind: 'heal', hp: 30 }, { kind: 'resupply' }],
    },
  },
  {
    // Attack range. Charges from damage dealt, mostly from out of reach.
    id: 'orla',
    name: 'Orla Teague',
    modifiers: [
      { hook: 'range', value: 1 },
      { hook: 'cost', units: ['indirect'], value: 15 },
      { hook: 'attack', units: ['direct'], value: -10 },
    ],
    charge: { damageDealt: 100, damageTaken: 30, kills: 20, captures: 1000, income: 0 },
    power: {
      name: 'Barrage',
      cost: 28000,
      modifiers: [
        { hook: 'range', value: 1 },
        { hook: 'attack', units: ['indirect'], value: 20 },
      ],
    },
  },
  {
    // Capture. Charges from every property taken.
    id: 'pip',
    name: 'Pip Harrow',
    modifiers: [
      { hook: 'capture', value: 50 },
      { hook: 'cost', units: ['infantry'], value: -25 },
    ],
    charge: { damageDealt: 40, damageTaken: 40, kills: 20, captures: 4000, income: 10 },
    power: {
      name: 'Flag Rush',
      cost: 22000,
      modifiers: [
        { hook: 'capture', value: 100 },
        { hook: 'movement', units: ['infantry'], value: 1 },
        { hook: 'attack', value: 15 },
      ],
    },
  },
];

/** Team colours: light, mid, dark, deep, as the sprite team placeholders expect. */
export type TeamColors = readonly [light: string, mid: string, dark: string, deep: string];

/** How a commander is presented. Rules live in `commanders`; this is the rest. */
export interface CommanderProfile {
  /** Rank or calling, shown under the name. */
  readonly title: string;
  readonly bio: string;
  /** Name of the innate ability. Omitted by a commander with none. */
  readonly innate?: string | undefined;
  /** The army the commander leads. Omitted to play under the seat's faction. */
  readonly army?: string | undefined;
  /** That army's colours. Omitted to keep the seat's faction colours. */
  readonly colors?: TeamColors | undefined;
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/, 'Colours are #rrggbb in lower case');

const profileSchema = z.object({
  title: z.string().min(1),
  bio: z.string().min(1),
  innate: z.string().min(1).optional(),
  army: z.string().min(1).optional(),
  colors: z.tuple([hex, hex, hex, hex]).optional(),
});

/** Profiles by commander ID, validated once at import. */
export const commanderProfiles: Readonly<Record<string, CommanderProfile>> = z
  .record(z.string(), profileSchema)
  .parse({
    none: {
      title: 'Field officer',
      bio: 'Fights by the book, with no innate ability and no power.',
    },
    iska: {
      title: 'Assault marshal',
      bio: 'Leads from the front and wins by striking first and hardest, trusting momentum over armour.',
      innate: 'Hot Barrels',
      army: 'Cinder Legion',
      colors: ['#f2705a', '#d9483b', '#a8302c', '#6e1f22'],
    },
    corvin: {
      title: 'Shield warden',
      bio: 'A patient builder of trench lines who would rather let an attack break on his defences than chase it.',
      innate: 'Dug In',
      army: 'Tidewatch',
      colors: ['#5aa0f2', '#3b78d9', '#2c55a8', '#1f386e'],
    },
    odile: {
      title: 'Quartermaster general',
      bio: 'Runs her war like a trading house: every city is a line in the ledger, and a full treasury wins in the end.',
      innate: 'Trade Ledger',
      army: 'Sunward Compact',
      colors: ['#f7d35a', '#e0ac32', '#b07f22', '#6e4e18'],
    },
    halden: {
      title: 'Surgeon colonel',
      bio: 'A field surgeon turned commander, whose troops keep standing long after they should have fallen.',
      innate: 'Field Medics',
      army: 'Fernhold Wardens',
      colors: ['#5ad6b8', '#2fae8f', '#21826b', '#155246'],
    },
    orla: {
      title: 'Battery commander',
      bio: 'Plots her fire from far behind the lines and seldom lets the enemy close enough to answer.',
      innate: 'Long Sight',
      army: 'Dusk Syndicate',
      colors: ['#b07af2', '#8a50d9', '#6638a8', '#40236e'],
    },
    pip: {
      title: 'Banner captain',
      bio: 'A brash young captain who plants flags faster than the enemy can tear them down.',
      innate: 'Quick Hands',
      army: 'Free Banners',
      colors: ['#f27ab4', '#d94a8c', '#a8326a', '#6e2046'],
    },
  } satisfies Record<string, CommanderProfile>);

const UNKNOWN_PROFILE: CommanderProfile = { title: 'Commander', bio: 'No briefing on file.' };

/** The profile of commander `id`, or a plain one for a commander that has none. */
export function commanderProfile(id: string): CommanderProfile {
  return commanderProfiles[id] ?? UNKNOWN_PROFILE;
}
