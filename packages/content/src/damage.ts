import type { RawDamageEntry } from '@tactics/engine';

/**
 * Base damage percent, by attacker and then defender, at full HP on open
 * ground. A defender missing from an attacker's row cannot be hit by that
 * weapon. Rows are sparse, so a new unit needs its own row and entries only in
 * the rows of units that can hit it. These numbers are this game's own balance
 * and are expected to change with playtesting; Prettier leaves the hand-grouped
 * rows alone.
 */
type DamageTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Primary weapons: cannons, shells and rockets. Limited by ammo. */
// prettier-ignore
const PRIMARY: DamageTable = {
  mech: {
    recon: 78, tank: 48, mediumTank: 18, apc: 68, artillery: 62, rockets: 76, antiAir: 58, missiles: 76,
  },
  tank: {
    recon: 82, tank: 52, mediumTank: 14, apc: 72, artillery: 68, rockets: 82, antiAir: 62, missiles: 82,
    lander: 12, cruiser: 6, submarine: 4, battleship: 2,
  },
  mediumTank: {
    recon: 100, tank: 80, mediumTank: 50, apc: 100, artillery: 100, rockets: 100, antiAir: 100, missiles: 100,
    lander: 36, cruiser: 32, submarine: 30, battleship: 12,
  },
  artillery: {
    infantry: 88, mech: 82, recon: 78, tank: 68, mediumTank: 42, apc: 68, artillery: 72, rockets: 78,
    antiAir: 72, missiles: 78,
    lander: 52, cruiser: 58, submarine: 56, battleship: 38,
  },
  rockets: {
    infantry: 92, mech: 88, recon: 88, tank: 78, mediumTank: 52, apc: 78, artillery: 78, rockets: 82,
    antiAir: 82, missiles: 88,
    lander: 62, cruiser: 78, submarine: 78, battleship: 52,
  },
  antiAir: {
    infantry: 100, mech: 100, recon: 58, tank: 22, mediumTank: 8, apc: 48, artillery: 48, rockets: 52,
    antiAir: 42, missiles: 52,
  },
  // Torpedoes. The cruiser's anti-air guns are its secondary weapon.
  cruiser: {
    lander: 28, cruiser: 28, submarine: 88, battleship: 6,
  },
  submarine: {
    lander: 94, cruiser: 24, submarine: 54, battleship: 58,
  },
  battleship: {
    infantry: 92, mech: 88, recon: 82, tank: 68, mediumTank: 52, apc: 82, artillery: 78, rockets: 84,
    antiAir: 82, missiles: 86,
    lander: 94, cruiser: 62, submarine: 64, battleship: 48,
  },
};

/** Secondary weapons: machine guns and anti-air guns. Never run out. */
// prettier-ignore
const SECONDARY: DamageTable = {
  infantry: {
    infantry: 50, mech: 40, recon: 10, tank: 4, mediumTank: 1, apc: 12, artillery: 14, rockets: 22,
    antiAir: 4, missiles: 22,
  },
  mech: {
    infantry: 60, mech: 50, recon: 16, tank: 5, mediumTank: 1, apc: 18, artillery: 28, rockets: 32,
    antiAir: 5, missiles: 32,
  },
  recon: {
    infantry: 68, mech: 58, recon: 32, tank: 5, mediumTank: 1, apc: 42, artillery: 42, rockets: 52,
    antiAir: 4, missiles: 26,
  },
  tank: {
    infantry: 72, mech: 66, recon: 38, tank: 5, mediumTank: 1, apc: 42, artillery: 42, rockets: 52,
    antiAir: 5, missiles: 28,
  },
  mediumTank: {
    infantry: 100, mech: 90, recon: 42, tank: 7, mediumTank: 1, apc: 42, artillery: 42, rockets: 52,
    antiAir: 6, missiles: 32,
  },
};

function buildEntries(): RawDamageEntry[] {
  const entries: RawDamageEntry[] = [];
  const attackers = new Set([...Object.keys(PRIMARY), ...Object.keys(SECONDARY)]);
  for (const attacker of attackers) {
    const primary = PRIMARY[attacker] ?? {};
    const secondary = SECONDARY[attacker] ?? {};
    const defenders = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
    for (const defender of defenders) {
      entries.push({
        attacker,
        defender,
        primary: primary[defender],
        secondary: secondary[defender],
      });
    }
  }
  return entries;
}

export const damage: readonly RawDamageEntry[] = buildEntries();
