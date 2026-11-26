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
