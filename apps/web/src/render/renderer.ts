import { MASK_EAST, MASK_NORTH, MASK_SOUTH, MASK_WEST, unitVisual } from '@tactics/content';
import {
  hpPips,
  maxPips,
  NO_TILE,
  NO_UNIT,
  UNREACHABLE,
  type CompiledRuleset,
  type GameState,
  type TileIndex,
  type Unit,
} from '@tactics/engine';
import { GRID, type Sprite, type SpriteLibrary } from '@tactics/sprites';
import { armiesOf } from '../session/armies';
import type { UiState } from '../store/uiStore';
import { tileSize } from './camera';
import type { Playback } from './playback';
import { SpriteCache } from './spriteCache';
import { compileTerrainLooks, drawTerrain, planTerrain, type TerrainPlan } from './terrainLayer';

const BACKGROUND = '#1b2a3a';
const IDLE_FRAME_MS = 500;
const RANGE_ALPHA = 0.5;
const TARGET_ALPHA = 0.6;
/** Opacity of the shadow under lifted (flying) units. */
const SHADOW_ALPHA = 0.3;
/** Opacity of a dived unit, seen through the water. */
const DIVED_ALPHA = 0.55;
/** A unit is flagged as low once fuel or ammo drops to this fraction of its maximum. */
const LOW_SUPPLY_FRACTION = 0.3;

/** Everything a frame is drawn from. The renderer reads it and changes none of it. */
export interface Scene {
  readonly state: GameState;
  readonly ui: UiState;
  readonly playback: Playback;
  /** Milliseconds, from `requestAnimationFrame`. */
  readonly time: number;
}

export interface Renderer {
  render(scene: Scene): void;
}

/** Which idle frame to show at `time`. The canvas only needs a redraw when this flips. */
export function idleFrameAt(time: number): number {
  return Math.floor(time / IDLE_FRAME_MS) & 1;
}

function directionBit(from: TileIndex, to: TileIndex, width: number): number {
  if (to === from - width) return MASK_NORTH;
  if (to === from + 1) return MASK_EAST;
  if (to === from + width) return MASK_SOUTH;
  return MASK_WEST;
}

/** How a unit type is drawn, with its sprite resolved. */
interface UnitLook {
  readonly sprite: Sprite;
  /** Height above the tile, in grid units. */
  readonly lift: number;
}

/** Tiles of the map inside the view. */
interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  ruleset: CompiledRuleset,
  library: SpriteLibrary,
): Renderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('Canvas 2D is not available');
  const ctx = context;
  const cache = new SpriteCache();

  // Content IDs are resolved to sprites once, not per frame. Missing art falls
  // back to placeholders, so new units and buildings draw before they have any.
  const terrainLooks = compileTerrainLooks(ruleset, library);
  const unitLooks: UnitLook[] = ruleset.units.map((unit) => {
    const visual = unitVisual(unit.id, ruleset.moveTypes[unit.moveType]!);
    return { sprite: library.resolve([visual.sprite, visual.fallback])!, lift: visual.lift };
  });
  const sprite = {
    cursor: library.get('ui.cursor'),
    moveTile: library.get('ui.moveTile'),
    attackTile: library.get('ui.attackTile'),
    capture: library.get('ui.iconCapture'),
    loaded: library.get('ui.iconLoaded'),
    fuel: library.get('ui.iconFuel'),
    ammo: library.get('ui.iconAmmo'),
    puff: library.get('fx.puff'),
    shadow: library.find('ui.shadow'),
    submerged: library.find('ui.submerged'),
  };
  const hpDigits: (Sprite | undefined)[] = [];
  for (let pips = 0; pips < maxPips(ruleset); pips++) hpDigits.push(library.find(`ui.hp.${pips}`));
  const pathPieces: (Sprite | undefined)[] = [];
  const pathHeads: (Sprite | undefined)[] = [];
  for (let mask = 0; mask < 16; mask++) {
    pathPieces.push(library.find(`ui.path.${mask}`));
    pathHeads.push(library.find(`ui.pathHead.${mask}`));
  }

  // Terrain changes rarely, so it is drawn into a view-sized layer that is only
  // redrawn when the map, ownership, camera or tile size changes. An animated
  // frame is then one blit of that layer plus the units.
  const layer = document.createElement('canvas');
  const layerCtx = layer.getContext('2d', { alpha: false });
  if (layerCtx === null) throw new Error('Canvas 2D is not available');
  let plan: TerrainPlan | null = null;
  let planTerrainOf: readonly number[] | null = null;
  let planOwnerOf: readonly number[] | null = null;
  let layerKey = '';

  // Per-frame drawing context, set at the top of `render`.
  let tile = GRID;
  let originX = 0;
  let originY = 0;

  function draw(image: CanvasImageSource, x: number, y: number, flip = false): void {
    if (flip) {
      ctx.setTransform(-1, 0, 0, 1, x + tile, y);
      ctx.drawImage(image, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.drawImage(image, x, y);
    }
  }

  function drawAtTile(sprite: Sprite, at: TileIndex, width: number, frame = 0): void {
    draw(
      cache.get(sprite, frame, -1),
      originX + (at % width) * tile,
      originY + ((at / width) | 0) * tile,
    );
  }

  function drawUnit(state: GameState, unit: Unit, x: number, y: number, frame: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    const look = unitLooks[unit.type]!;
    const acted = unit.moved && unit.owner === state.activePlayer;
    const lift = Math.round((look.lift * tile) / GRID);

    if (lift > 0 && sprite.shadow !== undefined) {
      ctx.globalAlpha = SHADOW_ALPHA;
      draw(cache.get(sprite.shadow, 0, -1), px, py);
    }
    ctx.globalAlpha = unit.dived ? DIVED_ALPHA : 1;
    // Sprites are authored facing right; odd player slots face left. Units that
    // have acted hold still on their first frame.
    const image = cache.get(look.sprite, acted ? 0 : frame, unit.owner, acted);
    draw(image, px, py - lift, (unit.owner & 1) === 1);
    ctx.globalAlpha = 1;
    if (unit.dived && sprite.submerged !== undefined) {
      draw(cache.get(sprite.submerged, frame, -1), px, py);
    }

    const def = ruleset.units[unit.type]!;
    const digit = hpDigits[hpPips(ruleset, unit.hp)];
    if (digit !== undefined) draw(cache.get(digit, 0, -1), px, py);
    if (unit.cargo.length > 0) draw(cache.get(sprite.loaded, 0, -1), px, py);
    else if (unit.pos !== NO_TILE && state.capture[unit.pos]! < ruleset.rules.capturePoints) {
      draw(cache.get(sprite.capture, 0, -1), px, py);
    }
    if (unit.fuel <= def.maxFuel * LOW_SUPPLY_FRACTION) draw(cache.get(sprite.fuel, 0, -1), px, py);
    if (def.maxAmmo > 0 && unit.ammo <= def.maxAmmo * LOW_SUPPLY_FRACTION) {
      draw(cache.get(sprite.ammo, 0, -1), px, py);
    }
  }

  function drawOverlays(state: GameState, ui: UiState): void {
    const { width } = state;
    if (ui.mode === 'moving' && ui.reach !== null) {
      ctx.globalAlpha = RANGE_ALPHA;
      const reach = ui.reach;
      for (let at = 0; at < reach.length; at++) {
        if (reach[at] !== UNREACHABLE) drawAtTile(sprite.moveTile, at, width);
      }
    } else if (ui.mode === 'targeting' || ui.mode === 'unloading') {
      ctx.globalAlpha = TARGET_ALPHA;
      const marker = ui.mode === 'targeting' ? sprite.attackTile : sprite.moveTile;
      for (const at of ui.targets) drawAtTile(marker, at, width);
    }
    ctx.globalAlpha = 1;

    const unit = state.units[ui.selectedUnit];
    if (unit === undefined || ui.path.length === 0 || unit.pos === NO_TILE) return;
    const path = ui.path;
    let previous = unit.pos;
    let piece = pathPieces[directionBit(previous, path[0]!, width)];
    if (piece !== undefined) drawAtTile(piece, previous, width);
    for (let i = 0; i < path.length; i++) {
      const at = path[i]!;
      const back = directionBit(at, previous, width);
      if (i === path.length - 1) {
        // The head points the way the unit is travelling: away from `back`.
        const travel = directionBit(previous, at, width);
        piece = pathHeads[travel];
      } else {
        piece = pathPieces[back | directionBit(at, path[i + 1]!, width)];
      }
      if (piece !== undefined) drawAtTile(piece, at, width);
      previous = at;
    }
  }

  function drawPlayback(state: GameState, playback: Playback, frame: number): void {
    const { width } = state;
    const tileX = (at: TileIndex) => originX + (at % width) * tile;
    const tileY = (at: TileIndex) => originY + ((at / width) | 0) * tile;
    const current = playback.current;
    const busy = current !== null && current.kind !== 'puff' ? current.unit : NO_UNIT;

    for (const [id, at] of playback.settled) {
      if (id === busy || playback.hidden.has(id)) continue;
      const unit = state.units[id];
      if (unit !== undefined) drawUnit(state, unit, tileX(at), tileY(at), frame);
    }
    if (current === null) return;

    if (current.kind === 'puff') {
      const frames = sprite.puff.frames.length;
      const step = Math.min(frames - 1, Math.floor(playback.progress * frames));
      draw(cache.get(sprite.puff, step, -1), tileX(current.at), tileY(current.at));
      return;
    }
    const unit = state.units[current.unit];
    if (unit === undefined) return;

    if (current.kind === 'slide') {
      const tiles = current.tiles;
      const along = playback.progress * (tiles.length - 1);
      const index = Math.min(tiles.length - 2, Math.floor(along));
      const t = along - index;
      const a = tiles[index]!;
      const b = tiles[index + 1]!;
      drawUnit(
        state,
        unit,
        tileX(a) + (tileX(b) - tileX(a)) * t,
        tileY(a) + (tileY(b) - tileY(a)) * t,
        frame,
      );
      return;
    }

    const swing = Math.sin(Math.PI * playback.progress);
    if (current.kind === 'bump') {
      const dx = Math.sign((current.toward % width) - (current.from % width));
      const dy = Math.sign(((current.toward / width) | 0) - ((current.from / width) | 0));
      const reach = swing * tile * 0.3;
      drawUnit(
        state,
        unit,
        tileX(current.from) + dx * reach,
        tileY(current.from) + dy * reach,
        frame,
      );
    } else {
      const at = playback.settled.get(current.unit) ?? unit.pos;
      if (at !== NO_TILE) drawUnit(state, unit, tileX(at), tileY(at) - swing * tile * 0.25, frame);
    }
  }

  /** Redraws the terrain layer if anything it depends on has changed. */
  function updateLayer(state: GameState, bounds: Bounds): void {
    if (plan === null || planTerrainOf !== state.terrain || planOwnerOf !== state.owner) {
      // Structural sharing in the engine means an unchanged array is the same
      // reference, so this is a cheap check.
      plan = planTerrain(state, terrainLooks);
      planTerrainOf = state.terrain;
      planOwnerOf = state.owner;
      layerKey = '';
    }
    const key = `${tile} ${originX} ${originY} ${canvas.width} ${canvas.height}`;
    if (key === layerKey) return;
    layerKey = key;
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
    layerCtx!.fillStyle = BACKGROUND;
    layerCtx!.fillRect(0, 0, layer.width, layer.height);
    drawTerrain(layerCtx!, plan, cache, bounds, originX, originY);
  }

  function render(scene: Scene): void {
    const { ui, playback, time } = scene;
    const animating = playback.base !== null;
    const state = playback.base ?? scene.state;
    const { camera, viewport } = ui;
    const { width, height } = state;

    tile = tileSize(camera, viewport);
    if (tile !== cache.tileSize) {
      cache.resize(tile);
      layerKey = '';
    }
    // Each side is drawn in its commander's colours; a new game may change them.
    if (cache.setTeams(armiesOf(ruleset, state).map((army) => army.ramp))) layerKey = '';
    originX = -Math.round(camera.x);
    originY = -Math.round(camera.y);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;

    // Only tiles inside the view are drawn.
    const x0 = Math.max(0, Math.floor(-originX / tile));
    const y0 = Math.max(0, Math.floor(-originY / tile));
    const x1 = Math.min(width - 1, Math.floor((-originX + canvas.width - 1) / tile));
    const y1 = Math.min(height - 1, Math.floor((-originY + canvas.height - 1) / tile));
    if (x1 < x0 || y1 < y0) {
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Layer 1: terrain and buildings, cached.
    updateLayer(state, { x0, y0, x1, y1 });
    ctx.drawImage(layer, 0, 0);

    // Layer 2: range, targets and the path arrow.
    if (!animating) drawOverlays(state, ui);

    // Layer 3: units. Once a move is confirmed the unit is shown at its destination.
    const frame = idleFrameAt(time);
    const previewing = !animating && ui.mode !== 'idle' && ui.mode !== 'moving';
    const relocated = previewing && ui.path.length > 0 ? ui.selectedUnit : NO_UNIT;
    const current = playback.current;
    const busy = animating && current !== null && current.kind !== 'puff' ? current.unit : NO_UNIT;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = state.occupant[y * width + x]!;
        if (id === NO_UNIT || id === relocated || id === busy) continue;
        if (animating && (playback.settled.has(id) || playback.hidden.has(id))) continue;
        drawUnit(state, state.units[id]!, originX + x * tile, originY + y * tile, frame);
      }
    }
    if (relocated !== NO_UNIT) {
      const at = ui.path[ui.path.length - 1]!;
      const unit = state.units[relocated];
      if (unit !== undefined) {
        drawUnit(
          state,
          unit,
          originX + (at % width) * tile,
          originY + ((at / width) | 0) * tile,
          frame,
        );
      }
    }

    // Layer 4: animation in progress, then the cursor.
    if (animating) drawPlayback(state, playback, frame);
    else if (ui.cursor !== NO_TILE) drawAtTile(sprite.cursor, ui.cursor, width);
  }

  return { render };
}
