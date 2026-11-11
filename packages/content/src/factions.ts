export interface Faction {
  readonly id: string;
  readonly name: string;
  /** UI accent colour. Sprite colour ramps live in the sprites package. */
  readonly color: string;
}

/** Player slot N plays faction N. Four are defined so 3-4 player maps can load. */
export const factions: readonly Faction[] = [
  { id: 'cinder', name: 'Cinder Legion', color: '#d9483b' },
  { id: 'tidewatch', name: 'Tidewatch', color: '#3b78d9' },
  { id: 'sunward', name: 'Sunward Compact', color: '#e0ac32' },
  { id: 'dusk', name: 'Dusk Syndicate', color: '#8a50d9' },
];
