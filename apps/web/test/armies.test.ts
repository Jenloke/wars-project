import { commanderProfile, factions, ruleset as rawRuleset } from '@tactics/content';
import { compileRuleset } from '@tactics/engine';
import { TEAM_RAMPS } from '@tactics/sprites';
import { describe, expect, it } from 'vitest';
import { armiesFor, portraitOf } from '../src/session/armies';

const ruleset = compileRuleset(rawRuleset);
const index = (id: string) => ruleset.commanders.findIndex((commander) => commander.id === id);
const NONE = index('none');

describe('armies', () => {
  it("play the default commander under each seat's faction, as before commanders", () => {
    const armies = armiesFor(ruleset, [NONE, NONE, NONE, NONE]);
    armies.forEach((army, seat) => {
      expect(army.name).toBe(factions[seat]!.name);
      expect(army.ramp).toEqual(TEAM_RAMPS[seat]);
      expect(army.color).toBe(factions[seat]!.color);
      expect(army.commanderName).toBe('Field Officer');
    });
  });

  it("take their commander's army name and colours", () => {
    const [first, second] = armiesFor(ruleset, [index('halden'), index('pip')]);
    expect(first).toMatchObject({
      seat: 0,
      commander: 'halden',
      commanderName: 'Halden Moss',
      name: 'Fernhold Wardens',
      portrait: 'portrait.halden',
    });
    expect(first!.ramp).toEqual(commanderProfile('halden').colors);
    expect(second!.ramp).toEqual(commanderProfile('pip').colors);
    expect(second!.color).toBe(commanderProfile('pip').colors![1]);
  });

  it('give a default commander a faction whose colours no commander has taken', () => {
    // Iska brings the Cinder Legion's red to seat 2, so seat 1 cannot be red too.
    const [first, second] = armiesFor(ruleset, [NONE, index('iska')]);
    expect(second!.name).toBe('Cinder Legion');
    expect(first!.name).toBe(factions[1]!.name);
    expect(first!.color).not.toBe(second!.color);
  });

  it('keep sides apart when both pick the same commander', () => {
    const [first, second] = armiesFor(ruleset, [index('corvin'), index('corvin')]);
    expect(first!.name).toBe('Tidewatch');
    expect(second!.commanderName).toBe('Corvin Ash');
    expect(second!.color).not.toBe(first!.color);
  });

  it('name portraits after the commander', () => {
    expect(portraitOf('orla')).toBe('portrait.orla');
  });
});
