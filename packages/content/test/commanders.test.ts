import { compileRuleset, type RawCommanderDef, type RawRuleset } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import {
  commanderProfile,
  commanderProfiles,
  describeCommander,
  REFERENCE_CHARGE,
  ruleset,
  rulesetSchema,
} from '../src/index';

const sample: RawCommanderDef = {
  id: 'sample',
  name: 'Sample',
  modifiers: [
    { hook: 'attack', value: 15 },
    { hook: 'defence', units: ['indirect'], value: -10 },
    { hook: 'movement', units: ['vehicle'], value: -1 },
    { hook: 'cost', units: ['infantry', 'mech'], value: -20 },
    { hook: 'range', value: 1 },
    { hook: 'capture', units: ['foot'], value: 50 },
    { hook: 'repair', value: 10 },
    { hook: 'regen', units: ['naval'], value: 5 },
    { hook: 'income', value: 20 },
  ],
  charge: { damageDealt: 100, damageTaken: 40, kills: 0, captures: 1500, income: 5 },
  power: {
    name: 'Rally',
    cost: 30000,
    modifiers: [{ hook: 'attack', units: ['direct'], value: 30 }],
    effects: [
      { kind: 'heal', hp: 30 },
      { kind: 'resupply', units: ['air'] },
      { kind: 'funds', incomePercent: 100 },
      { kind: 'funds', incomePercent: 50 },
    ],
  },
};

const withSample: RawRuleset = { ...ruleset, commanders: [...ruleset.commanders, sample] };

describe('commander descriptions', () => {
  it('describe every innate modifier from its data', () => {
    expect(describeCommander(withSample, 'sample').innate).toEqual([
      'All units: +15% firepower',
      'Indirect-fire units: −10% defence',
      'Vehicles: −1 movement',
      'Infantry and Mech: cost 20% less to build and repair',
      'Indirect-fire units: +1 range',
      'Foot units: +50% capture speed',
      'All units: +1 HP repaired on properties',
      'Ships: recover 0.5 HP each turn, anywhere, for free',
      '+20% income from properties',
    ]);
  });

  it('describe the power, its effects first', () => {
    expect(describeCommander(withSample, 'sample').power).toEqual({
      name: 'Rally',
      cost: 30000,
      lines: [
        'All units: heal 3 HP at once, for free',
        'Aircraft: refill fuel and ammo at once',
        "Collect a day's income at once",
        "Collect 50% of a day's income at once",
        'Direct-fire units: +30% firepower',
      ],
    });
  });

  it('rate each meter source against the reference rates', () => {
    expect(REFERENCE_CHARGE.damageDealt).toBe(50);
    expect(describeCommander(withSample, 'sample').charge).toEqual([
      { source: 'damageDealt', label: 'Dealing damage', pace: 'fast' },
      { source: 'damageTaken', label: 'Taking damage', pace: 'steady' },
      { source: 'kills', label: 'Destroying units', pace: 'none' },
      { source: 'captures', label: 'Capturing', pace: 'steady' },
      { source: 'income', label: 'Collecting income', pace: 'slow' },
    ]);
  });

  it('describe the default commander as having nothing to describe', () => {
    const plain = describeCommander(ruleset, 'none');
    expect(plain).toMatchObject({ name: 'Field Officer', innate: [], power: null });
  });

  it('refuse an unknown commander', () => {
    expect(() => describeCommander(ruleset, 'nobody')).toThrow(/Unknown commander "nobody"/);
  });

  it('describe a commander the schema and the engine both accept', () => {
    expect(rulesetSchema.parse(withSample).commanders.at(-1)).toEqual(sample);
    expect(compileRuleset(withSample).commanders.at(-1)!.power!.name).toBe('Rally');
  });
});

describe('commander profiles', () => {
  it('give the default commander a profile with no army of its own', () => {
    expect(commanderProfiles['none']).toMatchObject({ title: 'Field officer' });
    expect(commanderProfiles['none']!.army).toBeUndefined();
    expect(commanderProfiles['none']!.colors).toBeUndefined();
  });

  it('fall back to a plain profile for a commander that has none', () => {
    expect(commanderProfile('custom')).toEqual({ title: 'Commander', bio: 'No briefing on file.' });
  });
});

describe('the shipped commanders', () => {
  const playable = ruleset.commanders.filter((commander) => commander.power !== undefined);
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  };

  it('are at least five, each with an innate ability and one power', () => {
    expect(playable.length).toBeGreaterThanOrEqual(5);
    for (const commander of playable) {
      expect(commander.modifiers.length).toBeGreaterThan(0);
      expect(commander.power!.cost).toBeGreaterThan(0);
    }
  });

  it('each lead with a different mechanic, together covering every requested one', () => {
    const leads = playable.map((commander) => commander.modifiers[0]!.hook);
    expect(new Set(leads).size).toBe(leads.length);
    expect(leads).toEqual(
      expect.arrayContaining(['attack', 'defence', 'income', 'regen', 'range', 'capture']),
    );
  });

  it('charge their meters fastest from what they do best', () => {
    const fastest: Record<string, string[]> = {
      attack: ['damageDealt', 'kills'],
      defence: ['damageTaken'],
      income: ['captures', 'income'],
      regen: ['damageTaken', 'income'],
      range: ['damageDealt'],
      capture: ['captures'],
    };
    for (const commander of playable) {
      const fast = describeCommander(ruleset, commander.id)
        .charge.filter((line) => line.pace === 'fast')
        .map((line) => line.source);
      expect(fast).toEqual(fastest[commander.modifiers[0]!.hook]);
    }
  });

  it('each lead an army of their own, in colours no other army shares', () => {
    const profiles = playable.map((commander) => commanderProfile(commander.id));
    for (const profile of profiles) {
      expect(profile.army).toBeDefined();
      expect(profile.innate).toBeDefined();
      const ramp = profile.colors!;
      // Light to deep, as the team placeholders are.
      for (let i = 1; i < ramp.length; i++) {
        expect(luminance(ramp[i]!)).toBeLessThan(luminance(ramp[i - 1]!));
      }
    }
    expect(new Set(profiles.map((profile) => profile.army)).size).toBe(profiles.length);
    expect(new Set(profiles.map((profile) => profile.colors![1])).size).toBe(profiles.length);
  });

  it('are all described, with every effect of their power', () => {
    for (const commander of playable) {
      const summary = describeCommander(ruleset, commander.id);
      expect(summary.innate).toHaveLength(commander.modifiers.length);
      expect(summary.power!.lines).toHaveLength(
        commander.power!.modifiers.length + (commander.power!.effects?.length ?? 0),
      );
    }
  });
});
