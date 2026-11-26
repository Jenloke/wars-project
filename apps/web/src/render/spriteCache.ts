import { FACTION_COUNT, hexToRgb, rasterize, teamRamp, type Sprite } from '@tactics/sprites';

/** Units that have acted this turn are drawn half-way toward this dark blue. */
const ACTED_SHADE = { rgb: 0x101420, amount: 0.5 } as const;

/** Team ramps as numbers, one per variant: neutral, then each faction. */
const RAMPS: readonly (readonly number[])[] = Array.from({ length: FACTION_COUNT + 1 }, (_, v) =>
  teamRamp(v - 1).map(hexToRgb),
);

/** Colour variant of a sprite for an owner: 0 for neutral, then one per faction. */
function variantOf(sprite: Sprite, owner: number): number {
  if (!sprite.team || owner < 0) return 0;
  return (owner % FACTION_COUNT) + 1;
}

/**
 * Canvas copies of sprites at the current tile size, rasterized from the vector
 * source the first time each is drawn. Changing the size (zoom, display scale)
 * drops them, so every size is rendered from the source rather than scaled.
 */
export class SpriteCache {
  private size = 0;
  private readonly copies = new Map<Sprite, (HTMLCanvasElement | undefined)[]>();

  get tileSize(): number {
    return this.size;
  }

  /** Sets the pixel size sprites are drawn at, dropping copies made at another size. */
  resize(size: number): void {
    if (size === this.size) return;
    this.size = size;
    this.copies.clear();
  }

  /**
   * `frame` of `sprite` (wrapping, so any frame counter works) in `owner`'s colours,
   * neutral below 0, and darkened when `acted`. Sprites without team colours look
   * the same for every owner.
   */
  get(sprite: Sprite, frame: number, owner: number, acted = false): HTMLCanvasElement {
    const f = frame % sprite.frames.length;
    const variant = variantOf(sprite, owner);
    const slot = (f * RAMPS.length + variant) * 2 + (acted ? 1 : 0);
    let copies = this.copies.get(sprite);
    if (copies === undefined) {
      copies = [];
      this.copies.set(sprite, copies);
    }
    let canvas = copies[slot];
    if (canvas === undefined) {
      canvas = this.paint(sprite, f, variant, acted);
      copies[slot] = canvas;
    }
    return canvas;
  }

  private paint(sprite: Sprite, frame: number, variant: number, acted: boolean): HTMLCanvasElement {
    const size = this.size;
    const pixels = rasterize(sprite.frames[frame]!, size, {
      ramp: sprite.team ? RAMPS[variant] : undefined,
      shade: acted ? ACTED_SHADE : undefined,
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('Canvas 2D is not available');
    ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
    return canvas;
  }
}
