import { compileRuleset, NO_DAMAGE } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { ruleset } from '../src/index';

const compiled = compileRuleset(ruleset);

describe('ruleset', () => {
  it('compiles without dangling references', () => {
    expect(compiled.unitCount).toBe(10);
    expect(compiled.moveTypes).toEqual(['foot', 'mech', 'tread', 'tire', 'air', 'sea', 'lander']);
  });

  it('gives every armed land unit a target, except anti-air-only missiles', () => {
    for (let attacker = 0; attacker < compiled.unitCount; attacker++) {
      const unit = compiled.units[attacker]!;
      let targets = 0;
      for (let defender = 0; defender < compiled.unitCount; defender++) {
        const cell = attacker * compiled.unitCount + defender;
        if (compiled.primaryDamage[cell] !== NO_DAMAGE) targets++;
        else if (compiled.secondaryDamage[cell] !== NO_DAMAGE) targets++;
      }
      if (unit.maxRange === 0 || unit.id === 'missiles') expect(targets).toBe(0);
      else expect(targets).toBe(compiled.unitCount);
    }
  });

  it('only gives primary weapons to units that carry ammo', () => {
    for (let attacker = 0; attacker < compiled.unitCount; attacker++) {
      const row = compiled.primaryDamage.subarray(
        attacker * compiled.unitCount,
        (attacker + 1) * compiled.unitCount,
      );
      const hasPrimary = row.some((value) => value !== NO_DAMAGE);
      if (hasPrimary) expect(compiled.units[attacker]!.maxAmmo).toBeGreaterThan(0);
    }
  });
});
