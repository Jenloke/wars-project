import type { MapData } from '@tactics/engine';

export interface AsciiLegendEntry {
  readonly terrain: string;
  /**
   * Present for properties: the owning player slot, or null for neutral.
   * Absent for ordinary terrain.
   */
  readonly owner?: number | null;
}

export type AsciiLegend = Readonly<Record<string, AsciiLegendEntry>>;

/** The standard legend. Maps may supply their own. */
export const defaultLegend: AsciiLegend = {
  '~': { terrain: 'sea' },
  '.': { terrain: 'plains' },
  '=': { terrain: 'road' },
  F: { terrain: 'forest' },
  M: { terrain: 'mountain' },
  B: { terrain: 'bridge' },
  C: { terrain: 'city', owner: null },
  H: { terrain: 'hq', owner: 0 },
  R: { terrain: 'base', owner: 0 },
  h: { terrain: 'hq', owner: 1 },
  b: { terrain: 'base', owner: 1 },
};

export interface AsciiMapMeta {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly playerCount: number;
  readonly startingFunds: number;
  readonly incomePerProperty: number;
}

/**
 * Converts a compact ASCII map into the JSON map format. Each non-blank line is a
 * row and each character a tile. Surrounding whitespace is ignored, so maps can be
 * indented in source. Throws with the row number on any malformed input.
 */
export function asciiToMap(text: string, meta: AsciiMapMeta, legend = defaultLegend): MapData {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rows.length === 0) throw new Error(`Map "${meta.id}" is empty`);

  const width = rows[0]!.length;
  const tiles: string[] = [];
  const properties: { x: number; y: number; owner: number | null }[] = [];

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map "${meta.id}" row ${y} has ${row.length} tiles, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const char = row[x]!;
      const entry = legend[char];
      if (entry === undefined) {
        throw new Error(`Map "${meta.id}" row ${y} has unknown character "${char}"`);
      }
      tiles.push(entry.terrain);
      if (entry.owner !== undefined) properties.push({ x, y, owner: entry.owner });
    }
  });

  return {
    formatVersion: 1,
    id: meta.id,
    name: meta.name,
    author: meta.author,
    width,
    height: rows.length,
    tiles,
    properties,
    units: [],
    players: Array.from({ length: meta.playerCount }, (_unused, slot) => ({
      slot,
      startingFunds: meta.startingFunds,
    })),
    rules: { incomePerProperty: meta.incomePerProperty },
  };
}
