import { parseSpriteSvg, type SpriteFrame } from './svg';

/** A sprite: one or more frames of the same picture, such as a unit's idle cycle. */
export interface Sprite {
  readonly id: string;
  readonly frames: readonly SpriteFrame[];
  /** True if it uses team placeholder colours, so it is drawn in its owner's colours. */
  readonly team: boolean;
}

/**
 * Where a source file's sprite goes. `unit/tank.f1.svg` is frame 1 of `unit.tank`;
 * a file without a frame suffix is frame 0. Folders become ID segments, so art can
 * be grouped freely (`unit/naval/sub.svg` is `unit.naval.sub`).
 */
export function spriteIdOf(path: string): { readonly id: string; readonly frame: number } {
  if (!path.endsWith('.svg')) throw new Error(`${path}: sprite sources are .svg files`);
  const stem = path.slice(0, -'.svg'.length).replaceAll('\\', '/').split('/').join('.');
  const frameMatch = /^(.*)\.f(\d+)$/.exec(stem);
  return frameMatch === null
    ? { id: stem, frame: 0 }
    : { id: frameMatch[1]!, frame: Number(frameMatch[2]) };
}

/**
 * Sprites by ID. The renderer only ever asks for IDs (`unit.tank`, `terrain.forest`,
 * `building.city`, `ui.cursor`), so art can be added or replaced, at build time
 * from SVG files or at runtime with `add`, without touching drawing code.
 */
export class SpriteLibrary {
  private readonly sprites = new Map<string, Sprite>();

  /** Builds a library from SVG sources keyed by path below the sprite root. */
  static fromSources(sources: Readonly<Record<string, string>>): SpriteLibrary {
    const library = new SpriteLibrary();
    library.addSources(sources);
    return library;
  }

  /** Adds or replaces a sprite. */
  add(id: string, frames: readonly SpriteFrame[]): Sprite {
    if (frames.length === 0) throw new Error(`${id}: a sprite needs at least one frame`);
    const team = frames.some((frame) => frame.polygons.some((polygon) => polygon.team >= 0));
    const sprite: Sprite = { id, frames, team };
    this.sprites.set(id, sprite);
    return sprite;
  }

  /**
   * Parses and adds SVG sources keyed by path (see `spriteIdOf`). Frames must be
   * numbered from f0 without gaps.
   */
  addSources(sources: Readonly<Record<string, string>>): void {
    const byId = new Map<string, Map<number, SpriteFrame>>();
    for (const path of Object.keys(sources).sort()) {
      const { id, frame } = spriteIdOf(path);
      const frames = byId.get(id) ?? new Map<number, SpriteFrame>();
      if (frames.has(frame)) throw new Error(`${path}: ${id} already has frame ${frame}`);
      frames.set(frame, parseSpriteSvg(sources[path]!, path));
      byId.set(id, frames);
    }
    for (const [id, frames] of byId) {
      const ordered: SpriteFrame[] = [];
      for (let i = 0; i < frames.size; i++) {
        const frame = frames.get(i);
        if (frame === undefined) {
          throw new Error(`${id}: frames must be numbered from f0 without gaps`);
        }
        ordered.push(frame);
      }
      this.add(id, ordered);
    }
  }

  has(id: string): boolean {
    return this.sprites.has(id);
  }

  /** The sprite, or undefined if no art exists for it. */
  find(id: string): Sprite | undefined {
    return this.sprites.get(id);
  }

  /** The sprite. Throws if it is missing, which is an art bug. */
  get(id: string): Sprite {
    const sprite = this.sprites.get(id);
    if (sprite === undefined) throw new Error(`Missing sprite "${id}"`);
    return sprite;
  }

  /** The first of `ids` that has art, for a sprite with fallbacks. */
  resolve(ids: readonly string[]): Sprite | undefined {
    for (const id of ids) {
      const sprite = this.sprites.get(id);
      if (sprite !== undefined) return sprite;
    }
    return undefined;
  }

  ids(): string[] {
    return [...this.sprites.keys()].sort();
  }
}
