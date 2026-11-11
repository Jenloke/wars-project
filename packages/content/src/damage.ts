import type { RawDamageEntry } from '@tactics/engine';

/**
 * Base damage percent, attacker (row) against defender (column), at full HP on
 * open ground. `_` means the weapon cannot hit that target. These numbers are
 * this game's own balance and are expected to change with playtesting.
 */

const _ = null;
type Row = readonly (number | null)[];

const DEFENDERS = [
  'infantry',
  'mech',
  'recon',
  'tank',
  'mediumTank',
  'apc',
  'artillery',
  'rockets',
  'antiAir',
  'missiles',
] as const;

/** Primary weapons: cannons, shells and rockets. Limited by ammo. */
const PRIMARY: Readonly<Record<string, Row>> = {
  //            inf  mech recon tank  med  apc  art  rock  aa   miss
  mech:        [  _,   _,  78,  48,  18,  68,  62,  76,  58,  76],
  tank:        [  _,   _,  82,  52,  14,  72,  68,  82,  62,  82],
  mediumTank:  [  _,   _, 100,  80,  50, 100, 100, 100, 100, 100],
  artillery:   [ 88,  82,  78,  68,  42,  68,  72,  78,  72,  78],
  rockets:     [ 92,  88,  88,  78,  52,  78,  78,  82,  82,  88],
  antiAir:     [100, 100,  58,  22,   8,  48,  48,  52,  42,  52],
};

/** Secondary weapons: machine guns. Never run out. */
const SECONDARY: Readonly<Record<string, Row>> = {
  //            inf  mech recon tank  med  apc  art  rock  aa   miss
  infantry:    [ 50,  40,  10,   4,   1,  12,  14,  22,   4,  22],
  mech:        [ 60,  50,  16,   5,   1,  18,  28,  32,   5,  32],
  recon:       [ 68,  58,  32,   5,   1,  42,  42,  52,   4,  26],
  tank:        [ 72,  66,  38,   5,   1,  42,  42,  52,   5,  28],
  mediumTank:  [100,  90,  42,   7,   1,  42,  42,  52,   6,  32],
};

function buildEntries(): RawDamageEntry[] {
  const entries: RawDamageEntry[] = [];
  const attackers = new Set([...Object.keys(PRIMARY), ...Object.keys(SECONDARY)]);
  for (const attacker of attackers) {
    DEFENDERS.forEach((defender, column) => {
      const primary = PRIMARY[attacker]?.[column] ?? undefined;
      const secondary = SECONDARY[attacker]?.[column] ?? undefined;
      if (primary === undefined && secondary === undefined) return;
      entries.push({ attacker, defender, primary, secondary });
    });
  }
  return entries;
}

export const damage: readonly RawDamageEntry[] = buildEntries();
