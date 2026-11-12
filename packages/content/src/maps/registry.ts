import type { MapData, RawRuleset } from '@tactics/engine';
import { mapSchema } from '../schemas';

/**
 * Checks a map against a ruleset beyond what the schema can express. Returns a
 * list of problems; an empty list means the map is playable.
 */
export function validateMap(map: MapData, ruleset: RawRuleset): string[] {
  const problems: string[] = [];
  const terrainById = new Map(ruleset.terrain.map((t) => [t.id, t]));
  const unitIds = new Set(ruleset.units.map((u) => u.id));

  map.tiles.forEach((id, tile) => {
    if (!terrainById.has(id)) problems.push(`Tile ${tile} uses unknown terrain "${id}"`);
  });

  const listed = new Set<number>();
  const hqCount = new Array<number>(map.players.length).fill(0);
  for (const property of map.properties) {
    const tile = property.y * map.width + property.x;
    const def = terrainById.get(map.tiles[tile] ?? '');
    if (def?.property === undefined) {
      problems.push(`Property at (${property.x},${property.y}) is not on property terrain`);
      continue;
    }
    if (listed.has(tile)) {
      problems.push(`Property at (${property.x},${property.y}) is listed twice`);
    }
    listed.add(tile);
    if (property.owner !== null) {
      if (property.owner >= map.players.length) {
        problems.push(`Property at (${property.x},${property.y}) has no such owner`);
      } else if (def.property.isHq) {
        hqCount[property.owner] = (hqCount[property.owner] ?? 0) + 1;
      }
    }
  }

  map.tiles.forEach((id, tile) => {
    if (terrainById.get(id)?.property !== undefined && !listed.has(tile)) {
      problems.push(`Property terrain at tile ${tile} is missing from the property list`);
    }
  });
  hqCount.forEach((count, slot) => {
    if (count !== 1) problems.push(`Player ${slot} has ${count} HQs, expected exactly 1`);
  });

  const occupied = new Set<number>();
  for (const unit of map.units) {
    const tile = unit.y * map.width + unit.x;
    if (!unitIds.has(unit.type)) problems.push(`Unknown unit type "${unit.type}"`);
    if (unit.owner >= map.players.length) problems.push(`Unit at tile ${tile} has no such owner`);
    if (occupied.has(tile)) problems.push(`Two units share tile ${tile}`);
    occupied.add(tile);
  }
  return problems;
}

/** Holds every loadable map. Maps of any size can be registered at runtime. */
export class MapRegistry {
  private readonly maps = new Map<string, MapData>();

  constructor(private readonly ruleset: RawRuleset) {}

  /** Validates and adds a map. Accepts untrusted JSON (imports, the editor). */
  register(candidate: unknown): MapData {
    const map: MapData = mapSchema.parse(candidate);
    const problems = validateMap(map, this.ruleset);
    if (problems.length > 0) {
      throw new Error(`Map "${map.id}" is invalid:\n- ${problems.join('\n- ')}`);
    }
    this.maps.set(map.id, map);
    return map;
  }

  get(id: string): MapData {
    const map = this.maps.get(id);
    if (map === undefined) throw new Error(`Unknown map "${id}"`);
    return map;
  }

  list(): MapData[] {
    return [...this.maps.values()];
  }
}
