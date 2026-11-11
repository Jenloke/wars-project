import { MASK_EAST, MASK_NORTH, MASK_SOUTH, MASK_WEST, unitSpriteId } from '@tactics/content';
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
import {
  CELL,
  findSprite,
  getSprite,
  TEAM_STRIDE,
  type AtlasScale,
  type SpriteRef,
} from '@tactics/sprites';
import type { UiState } from '../store/uiStore';
import { renderScale } from './camera';
import type { Playback } from './playback';
import { buildTerrainLayer, compileTerrainSprites } from './terrainLayer';

const BACKGROUND = '#1b2a3a';
const IDLE_FRAME_MS = 500;
const RANGE_ALPHA = 0.5;
const TARGET_ALPHA = 0.6;
/** A unit is flagged as low once fuel or ammo drops to this fraction of its maximum. */
const LOW_SUPPLY_FRACTION = 0.3;
const MOVED_DIM = 'rgba(16, 20, 32, 0.5)';

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

/** A copy of the atlas with every opaque pixel darkened, for units that have acted. */
function dimmedCopy(atlas: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.naturalWidth;
  canvas.height = atlas.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(atlas, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = MOVED_DIM;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function directionBit(from: TileIndex, to: TileIndex, width: number): number {
  if (to === from - width) return MASK_NORTH;
  if (to === from + 1) return MASK_EAST;
  if (to === from + width) return MASK_SOUTH;
  return MASK_WEST;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  ruleset: CompiledRuleset,
  atlases: Readonly<Record<AtlasScale, HTMLImageElement>>,
): Renderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('Canvas 2D is not available');
  const ctx = context;

  // Sprite IDs are resolved to atlas positions once, not per frame.
  const terrainSprites = compileTerrainSprites(ruleset);
  const unitSprites = ruleset.units.map((unit) => getSprite(unitSpriteId(unit.id)));
  const sprite = {
    cursor: getSprite('ui.cursor'),
    moveTile: getSprite('ui.moveTile'),
    attackTile: getSprite('ui.attackTile'),
    capture: getSprite('ui.iconCapture'),
    loaded: getSprite('ui.iconLoaded'),
    fuel: getSprite('ui.iconFuel'),
    ammo: getSprite('ui.iconAmmo'),
    puff: getSprite('fx.puff'),
  };
  const hpDigits: (SpriteRef | undefined)[] = [];
  for (let pips = 0; pips < maxPips(ruleset); pips++) hpDigits.push(findSprite(`ui.hp.${pips}`));
  const pathPieces: (SpriteRef | undefined)[] = [];
  const pathHeads: (SpriteRef | undefined)[] = [];
  for (let mask = 0; mask < 16; mask++) {
    pathPieces.push(findSprite(`ui.path.${mask}`));
    pathHeads.push(findSprite(`ui.pathHead.${mask}`));
  }

  const dimmed: Partial<Record<AtlasScale, HTMLCanvasElement>> = {};
  let layer: HTMLCanvasElement | null = null;
  let layerTerrain: readonly number[] | null = null;
  let layerOwner: readonly number[] | null = null;
  let layerScale: AtlasScale = 1;

  // Per-frame drawing context, set at the top of `render`.
  let atlas: CanvasImageSource = atlases[1];
  let atlasScale: AtlasScale = 1;
  let tile = CELL;
  let originX = 0;
  let originY = 0;

  function blit(
    source: CanvasImageSource,
    ref: SpriteRef,
    frame: number,
    variant: number,
    x: number,
    y: number,
    flip: boolean,
  ): void {
    const size = CELL * atlasScale;
    const sx = (ref.x + frame * CELL) * atlasScale;
    const sy = (ref.y + (ref.team ? variant * TEAM_STRIDE : 0)) * atlasScale;
    if (flip) {
      ctx.setTransform(-1, 0, 0, 1, x + tile, y);
      ctx.drawImage(source, sx, sy, size, size, 0, 0, tile, tile);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.drawImage(source, sx, sy, size, size, x, y, tile, tile);
    }
  }

  function drawAtTile(ref: SpriteRef, at: TileIndex, width: number): void {
    blit(atlas, ref, 0, 0, originX + (at % width) * tile, originY + ((at / width) | 0) * tile, false);
  }

  function drawUnit(state: GameState, unit: Unit, x: number, y: number, frame: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    const ref = unitSprites[unit.type]!;
    const acted = unit.moved && unit.owner === state.activePlayer;
    const source = acted ? (dimmed[atlasScale] ??= dimmedCopy(atlases[atlasScale])) : atlas;
    // Sprites are authored facing right; odd player slots face left.
    blit(source, ref, acted ? 0 : frame % ref.frames, unit.owner, px, py, (unit.owner & 1) === 1);

    const def = ruleset.units[unit.type]!;
    const pips = hpPips(ruleset, unit.hp);
    const digit = hpDigits[pips];
    if (digit !== undefined) blit(atlas, digit, 0, 0, px, py, false);
    if (unit.cargo.length > 0) blit(atlas, sprite.loaded, 0, 0, px, py, false);
    else if (unit.pos !== NO_TILE && state.capture[unit.pos]! < ruleset.rules.capturePoints) {
      blit(atlas, sprite.capture, 0, 0, px, py, false);
    }
    if (unit.fuel <= def.maxFuel * LOW_SUPPLY_FRACTION) blit(atlas, sprite.fuel, 0, 0, px, py, false);
    if (def.maxAmmo > 0 && unit.ammo <= def.maxAmmo * LOW_SUPPLY_FRACTION) {
      blit(atlas, sprite.ammo, 0, 0, px, py, false);
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
      const step = Math.min(sprite.puff.frames - 1, Math.floor(playback.progress * sprite.puff.frames));
      blit(atlas, sprite.puff, step, 0, tileX(current.at), tileY(current.at), false);
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
      drawUnit(state, unit, tileX(current.from) + dx * reach, tileY(current.from) + dy * reach, frame);
    } else {
      const at = playback.settled.get(current.unit) ?? unit.pos;
      if (at !== NO_TILE) drawUnit(state, unit, tileX(at), tileY(at) - swing * tile * 0.25, frame);
    }
  }

  function render(scene: Scene): void {
    const { ui, playback, time } = scene;
    const animating = playback.base !== null;
    const state = playback.base ?? scene.state;
    const { camera, viewport } = ui;
    const { width, height } = state;

    const scale = renderScale(camera, viewport);
    atlasScale = scale >= 2 ? 2 : 1;
    atlas = atlases[atlasScale];
    tile = CELL * scale;
    originX = -Math.round(camera.x);
    originY = -Math.round(camera.y);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Layer 1: terrain and buildings, cached. Structural sharing in the engine
    // means an unchanged array is the same reference, so this is a cheap check.
    if (
      layer === null ||
      layerTerrain !== state.terrain ||
      layerOwner !== state.owner ||
      layerScale !== atlasScale
    ) {
      layer = buildTerrainLayer(state, terrainSprites, atlas, atlasScale);
      layerTerrain = state.terrain;
      layerOwner = state.owner;
      layerScale = atlasScale;
    }

    // Only tiles inside the view are drawn.
    const x0 = Math.max(0, Math.floor(-originX / tile));
    const y0 = Math.max(0, Math.floor(-originY / tile));
    const x1 = Math.min(width - 1, Math.floor((-originX + canvas.width - 1) / tile));
    const y1 = Math.min(height - 1, Math.floor((-originY + canvas.height - 1) / tile));
    if (x1 < x0 || y1 < y0) return;

    const cell = CELL * atlasScale;
    const columns = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    ctx.drawImage(
      layer,
      x0 * cell,
      y0 * cell,
      columns * cell,
      rows * cell,
      originX + x0 * tile,
      originY + y0 * tile,
      columns * tile,
      rows * tile,
    );

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
