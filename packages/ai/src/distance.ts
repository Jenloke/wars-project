import { IMPASSABLE, type CompiledRuleset, type GameState, type TileIndex } from '@tactics/engine';

/** Distance of a tile that cannot reach (or be reached from) any goal. */
export const FAR = 0x3fffffff;

/** Min-heap of packed `distance * tileCount + tile` keys. */
function heapPush(heap: number[], key: number): void {
  let i = heap.length;
  heap.push(key);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent]! <= key) break;
    heap[i] = heap[parent]!;
    i = parent;
  }
  heap[i] = key;
}

function heapPop(heap: number[]): number {
  const top = heap[0]!;
  const last = heap.pop()!;
  const size = heap.length;
  if (size === 0) return top;
  let i = 0;
  for (;;) {
    const left = 2 * i + 1;
    if (left >= size) break;
    const right = left + 1;
    const child = right < size && heap[right]! < heap[left]! ? right : left;
    if (heap[child]! >= last) break;
    heap[i] = heap[child]!;
    i = child;
  }
  heap[i] = last;
  return top;
}

/**
 * Dijkstra over terrain for one move type, ignoring units. Long-range planning
 * looks past this turn, when the units in the way will have moved.
 *
 * `toGoals` false: cost of walking from the nearest source to each tile.
 * `toGoals` true: cost of walking from each tile to the nearest source. Entering a
 * tile costs that tile's terrain, so the two directions differ on mixed terrain.
 */
function terrainDijkstra(
  ruleset: CompiledRuleset,
  state: GameState,
  moveType: number,
  sources: Iterable<TileIndex>,
  toGoals: boolean,
): Int32Array {
  const { width, height, terrain } = state;
  const tileCount = width * height;
  const row = moveType * ruleset.terrainCount;
  const moveCost = ruleset.moveCost;
  const dist = new Int32Array(tileCount).fill(FAR);
  const heap: number[] = [];

  for (const source of sources) {
    if (moveCost[row + terrain[source]!] === IMPASSABLE || dist[source] === 0) continue;
    dist[source] = 0;
    heapPush(heap, source);
  }

  while (heap.length > 0) {
    const key = heapPop(heap);
    const tile = key % tileCount;
    const d = (key - tile) / tileCount;
    if (d !== dist[tile]) continue; // superseded by a cheaper route
    const here = moveCost[row + terrain[tile]!]!;
    const x = tile % width;
    const y = (tile / width) | 0;
    for (let dir = 0; dir < 4; dir++) {
      let next: number;
      if (dir === 0) {
        if (y === 0) continue;
        next = tile - width;
      } else if (dir === 1) {
        if (x === width - 1) continue;
        next = tile + 1;
      } else if (dir === 2) {
        if (y === height - 1) continue;
        next = tile + width;
      } else {
        if (x === 0) continue;
        next = tile - 1;
      }
      const there = moveCost[row + terrain[next]!]!;
      if (there === IMPASSABLE) continue;
      // Walking toward the goals, a unit on `next` steps onto `tile`; walking away
      // from the origins, a unit on `tile` steps onto `next`.
      const nextDist = d + (toGoals ? here : there);
      if (nextDist >= dist[next]!) continue;
      dist[next] = nextDist;
      heapPush(heap, nextDist * tileCount + next);
    }
  }
  return dist;
}

/** Movement cost from the nearest of `origins` to every tile, or `FAR`. */
export function costsFrom(
  ruleset: CompiledRuleset,
  state: GameState,
  moveType: number,
  origins: Iterable<TileIndex>,
): Int32Array {
  return terrainDijkstra(ruleset, state, moveType, origins, false);
}

/** Movement cost from every tile to the nearest of `goals`, or `FAR`. */
export function costsTo(
  ruleset: CompiledRuleset,
  state: GameState,
  moveType: number,
  goals: Iterable<TileIndex>,
): Int32Array {
  return terrainDijkstra(ruleset, state, moveType, goals, true);
}

/** Tiles at a Manhattan distance between `minRange` and `maxRange` from `center`. */
export function tilesInRange(
  center: TileIndex,
  minRange: number,
  maxRange: number,
  width: number,
  height: number,
  out: TileIndex[],
): TileIndex[] {
  out.length = 0;
  const cx = center % width;
  const cy = (center / width) | 0;
  for (let dy = -maxRange; dy <= maxRange; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    const ady = dy < 0 ? -dy : dy;
    const span = maxRange - ady;
    for (let dx = -span; dx <= span; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width) continue;
      if (ady + (dx < 0 ? -dx : dx) < minRange) continue;
      out.push(y * width + x);
    }
  }
  return out;
}
