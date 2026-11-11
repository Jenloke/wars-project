/** Unit identifier. Monotonically increasing and never reused within a game. */
export type UnitId = number;
/** Index into `GameState.players`. */
export type PlayerIndex = number;
/** Flat tile index: `y * width + x`. */
export type TileIndex = number;

export const NO_UNIT = -1;
export const NO_OWNER = -1;
export const NO_TILE = -1;

export const SCHEMA_VERSION = 1;

export type ControllerKind = 'local' | 'ai' | 'remote';

export interface Unit {
  readonly id: UnitId;
  /** Index into `CompiledRuleset.units`. */
  readonly type: number;
  readonly owner: PlayerIndex;
  /** Tile the unit stands on, or `NO_TILE` while loaded in a transport. */
  readonly pos: TileIndex;
  /** Internal hit points, 1..maxHp. Displayed as `ceil(hp / hpPerPip)`. */
  readonly hp: number;
  readonly fuel: number;
  readonly ammo: number;
  /** True once the unit has acted this turn. */
  readonly moved: boolean;
  readonly cargo: readonly UnitId[];
  /** Transport carrying this unit, or `NO_UNIT`. */
  readonly carrier: UnitId;
}

export interface Player {
  readonly funds: number;
  /** Index into `CompiledRuleset.commanders`. 0 is the no-op commander. */
  readonly commander: number;
  readonly power: number;
  readonly controller: ControllerKind;
  readonly alive: boolean;
}

export type WinReason = 'hq' | 'rout' | 'resign';

export type GameStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'won'; readonly winner: PlayerIndex; readonly reason: WinReason };

/**
 * Complete game state. Plain JSON: no class instances, functions, or typed arrays.
 * Per-tile data is stored in flat arrays indexed by `TileIndex`.
 */
export interface GameState {
  readonly schemaVersion: number;
  readonly rulesetId: string;
  readonly mapId: string;
  readonly width: number;
  readonly height: number;
  /** Per tile: index into `CompiledRuleset.terrain`. */
  readonly terrain: readonly number[];
  /** Per tile: owning player, or `NO_OWNER`. */
  readonly owner: readonly number[];
  /** Per tile: capture points remaining before the property changes hands. */
  readonly capture: readonly number[];
  /** Per tile: unit standing there, or `NO_UNIT`. */
  readonly occupant: readonly number[];
  readonly units: Readonly<Record<UnitId, Unit>>;
  readonly nextUnitId: number;
  readonly players: readonly Player[];
  readonly activePlayer: PlayerIndex;
  readonly day: number;
  readonly incomePerProperty: number;
  /** Seeded RNG state (uint32). Advanced on every random draw. */
  readonly rng: number;
  readonly status: GameStatus;
}

export interface UnloadDrop {
  readonly cargo: UnitId;
  readonly to: TileIndex;
}

/**
 * Every player input. `path` lists the tiles entered in order, excluding the unit's
 * current tile; an empty path means the unit acts where it stands.
 */
export type Action =
  | { readonly type: 'Move'; readonly unit: UnitId; readonly path: readonly TileIndex[] }
  | {
      readonly type: 'Attack';
      readonly unit: UnitId;
      readonly path: readonly TileIndex[];
      readonly target: TileIndex;
    }
  | { readonly type: 'Capture'; readonly unit: UnitId; readonly path: readonly TileIndex[] }
  | { readonly type: 'Join'; readonly unit: UnitId; readonly path: readonly TileIndex[] }
  | { readonly type: 'Load'; readonly unit: UnitId; readonly path: readonly TileIndex[] }
  | {
      readonly type: 'Unload';
      readonly unit: UnitId;
      readonly path: readonly TileIndex[];
      readonly drops: readonly UnloadDrop[];
    }
  | { readonly type: 'Supply'; readonly unit: UnitId; readonly path: readonly TileIndex[] }
  | { readonly type: 'Build'; readonly at: TileIndex; readonly unitType: number }
  | { readonly type: 'EndTurn' }
  | { readonly type: 'Resign' };

export type ActionType = Action['type'];

/** Side effects of an action, for presentation only. Never needed to replay. */
export type GameEvent =
  | {
      readonly type: 'UnitMoved';
      readonly unit: UnitId;
      readonly from: TileIndex;
      readonly path: readonly TileIndex[];
    }
  | {
      readonly type: 'Attacked';
      readonly attacker: UnitId;
      readonly defender: UnitId;
      readonly from: TileIndex;
      readonly target: TileIndex;
      readonly damage: number;
      readonly isCounter: boolean;
    }
  | {
      readonly type: 'UnitDestroyed';
      readonly unit: UnitId;
      readonly at: TileIndex;
    }
  | {
      readonly type: 'CaptureProgress';
      readonly unit: UnitId;
      readonly at: TileIndex;
      readonly remaining: number;
    }
  | { readonly type: 'Captured'; readonly at: TileIndex; readonly by: PlayerIndex }
  | { readonly type: 'UnitBuilt'; readonly unit: UnitId; readonly at: TileIndex }
  | { readonly type: 'Supplied'; readonly by: UnitId; readonly targets: readonly TileIndex[] }
  | { readonly type: 'Joined'; readonly unit: UnitId; readonly into: UnitId }
  | { readonly type: 'Loaded'; readonly unit: UnitId; readonly into: UnitId }
  | { readonly type: 'Unloaded'; readonly unit: UnitId; readonly from: UnitId; readonly to: TileIndex }
  | { readonly type: 'TurnStarted'; readonly player: PlayerIndex; readonly day: number }
  | { readonly type: 'PlayerDefeated'; readonly player: PlayerIndex; readonly reason: WinReason }
  | { readonly type: 'GameWon'; readonly winner: PlayerIndex; readonly reason: WinReason };

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: string };

/** Versioned map format. Terrain and unit types are string IDs from the ruleset. */
export interface MapData {
  readonly formatVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly width: number;
  readonly height: number;
  /** Terrain IDs in row-major order; length is `width * height`. */
  readonly tiles: readonly string[];
  readonly properties: readonly {
    readonly x: number;
    readonly y: number;
    /** Player slot, or null for neutral. */
    readonly owner: number | null;
  }[];
  readonly units: readonly {
    readonly x: number;
    readonly y: number;
    readonly type: string;
    readonly owner: number;
    readonly hp?: number | undefined;
  }[];
  readonly players: readonly { readonly slot: number; readonly startingFunds: number }[];
  readonly rules: { readonly incomePerProperty: number };
}
