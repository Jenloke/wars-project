import {
  NO_UNIT,
  type GameEvent,
  type GameState,
  type TileIndex,
  type UnitId,
} from '@tactics/engine';

const SLIDE_MS_PER_TILE = 70;
const BUMP_MS = 180;
const HOP_MS = 260;
const PUFF_MS = 320;

export type Tween =
  | {
      readonly kind: 'slide';
      readonly unit: UnitId;
      /** Tiles visited, starting with the tile the unit leaves. */
      readonly tiles: readonly TileIndex[];
      readonly duration: number;
    }
  | {
      readonly kind: 'bump';
      readonly unit: UnitId;
      readonly from: TileIndex;
      readonly toward: TileIndex;
      readonly duration: number;
    }
  | { readonly kind: 'hop'; readonly unit: UnitId; readonly duration: number }
  | {
      readonly kind: 'puff';
      readonly unit: UnitId;
      readonly at: TileIndex;
      readonly duration: number;
    };

function tweensFor(next: GameState, events: readonly GameEvent[]): Tween[] {
  const tweens: Tween[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'UnitMoved':
        tweens.push({
          kind: 'slide',
          unit: event.unit,
          tiles: [event.from, ...event.path],
          duration: event.path.length * SLIDE_MS_PER_TILE,
        });
        break;
      case 'Unloaded': {
        const carrier = next.units[event.from];
        if (carrier !== undefined) {
          tweens.push({
            kind: 'slide',
            unit: event.unit,
            tiles: [carrier.pos, event.to],
            duration: SLIDE_MS_PER_TILE * 2,
          });
        }
        break;
      }
      case 'Attacked':
        tweens.push({
          kind: 'bump',
          unit: event.attacker,
          from: event.from,
          toward: event.target,
          duration: BUMP_MS,
        });
        break;
      case 'CaptureProgress':
        tweens.push({ kind: 'hop', unit: event.unit, duration: HOP_MS });
        break;
      case 'Captured': {
        const unit = next.occupant[event.at];
        if (unit !== undefined && unit !== NO_UNIT) {
          tweens.push({ kind: 'hop', unit, duration: HOP_MS });
        }
        break;
      }
      case 'UnitDestroyed':
        tweens.push({ kind: 'puff', unit: event.unit, at: event.at, duration: PUFF_MS });
        break;
      default:
        break;
    }
  }
  return tweens;
}

/**
 * Transient animation state for the action that was just applied. While it plays,
 * the renderer draws the state from *before* the action, adjusted by what has
 * played so far (`settled`, `hidden`) and the tween in progress. It is never part
 * of game state and can be dropped at any time without affecting the game.
 */
export class Playback {
  /** State to draw while playing: the one before the action. */
  base: GameState | null = null;
  /** Units that have finished moving, and the tile they now stand on. */
  readonly settled = new Map<UnitId, TileIndex>();
  /** Units that have been destroyed so far. */
  readonly hidden = new Set<UnitId>();
  current: Tween | null = null;
  /** Progress of `current`, 0..1. */
  progress = 0;

  private queue: Tween[] = [];
  private index = 0;
  private startedAt = 0;

  get active(): boolean {
    return this.base !== null;
  }

  play(previous: GameState, next: GameState, events: readonly GameEvent[], now: number): void {
    const tweens = tweensFor(next, events);
    this.stop();
    if (tweens.length === 0) return;
    this.base = previous;
    this.queue = tweens;
    this.begin(0, now);
  }

  stop(): void {
    this.base = null;
    this.current = null;
    this.queue = [];
    this.settled.clear();
    this.hidden.clear();
  }

  /** Advances to `now`. Returns true while there is still something to draw. */
  update(now: number): boolean {
    while (this.current !== null) {
      const elapsed = now - this.startedAt;
      if (elapsed < this.current.duration) {
        this.progress = elapsed / this.current.duration;
        return true;
      }
      this.finish(this.current);
      if (this.index + 1 >= this.queue.length) {
        this.stop();
        return false;
      }
      this.begin(this.index + 1, this.startedAt + this.current.duration);
    }
    return false;
  }

  private begin(index: number, now: number): void {
    this.index = index;
    this.current = this.queue[index]!;
    this.startedAt = now;
    this.progress = 0;
    if (this.current.kind === 'puff') this.hidden.add(this.current.unit);
  }

  private finish(tween: Tween): void {
    if (tween.kind === 'slide') {
      this.settled.set(tween.unit, tween.tiles[tween.tiles.length - 1]!);
    }
  }
}

export const playback = new Playback();
