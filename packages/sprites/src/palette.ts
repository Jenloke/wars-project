/**
 * The one shared palette. Every fill in every sprite SVG must be one of these
 * colours or a team placeholder; the atlas build rejects anything else.
 */
export const palette = {
  grassLight: '#8cc257',
  grass: '#74ad48',
  grassDark: '#5f943c',

  roadLight: '#c4bca8',
  road: '#a8a08c',
  roadDark: '#8a8372',

  leafLight: '#4a9a52',
  leaf: '#357d44',
  leafDark: '#266238',
  trunk: '#6b4a2e',

  rockLight: '#b99468',
  rock: '#96744d',
  rockDark: '#74583a',
  snow: '#f2efe6',
  snowShade: '#d5d0c2',

  seaLight: '#5aa9e0',
  sea: '#3b8fd0',
  seaDark: '#2f79b8',

  sandLight: '#ead9a0',
  sand: '#d2be80',

  wallLight: '#ece7d9',
  wall: '#cbc5b5',
  wallDark: '#a59f90',
  glass: '#4a5568',

  metalLight: '#8a90a0',
  metal: '#5d6372',
  metalDark: '#3a3f4b',

  skin: '#e8b98a',

  white: '#ffffff',
  ink: '#1d1f26',
  moveBlue: '#4aa3ff',
  moveBlueLight: '#8cc4ff',
  attackRed: '#ff5a4a',
  attackRedLight: '#ff9a8c',
  gold: '#ffd23f',
  goldDark: '#d99a1e',
  smokeLight: '#e4e4e4',
  smoke: '#b4b4b4',
  smokeDark: '#7c7c7c',
} as const;

/**
 * Colours that mark team-coloured surfaces in sprite sources: light, mid, dark,
 * deep. The atlas build swaps them for a faction ramp.
 */
export const TEAM_PLACEHOLDERS = ['#ff00ff', '#cc00cc', '#990099', '#660066'] as const;

export type TeamRamp = readonly [light: string, mid: string, dark: string, deep: string];

/** One ramp per faction, in player-slot order, then the neutral ramp. */
export const TEAM_RAMPS: readonly TeamRamp[] = [
  ['#f2705a', '#d9483b', '#a8302c', '#6e1f22'], // Cinder Legion
  ['#5aa0f2', '#3b78d9', '#2c55a8', '#1f386e'], // Tidewatch
  ['#f7d35a', '#e0ac32', '#b07f22', '#6e4e18'], // Sunward Compact
  ['#b07af2', '#8a50d9', '#6638a8', '#40236e'], // Dusk Syndicate
  ['#e6e2d8', '#c2bdb0', '#98938a', '#66625c'], // neutral
];

export const FACTION_COUNT = 4;
/** Atlas variant index of the neutral ramp. */
export const NEUTRAL_VARIANT = FACTION_COUNT;
