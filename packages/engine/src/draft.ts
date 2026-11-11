import { neighbours } from './grid';
import type { CompiledRuleset } from './ruleset';
import {
  NO_OWNER,
  NO_TILE,
  NO_UNIT,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerIndex,
  type TileIndex,
  type Unit,
  type UnitId,
  type WinReason,
} from './types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Copy-on-write working copy of a `GameState`. `state` starts as a shallow copy
 * that shares every array and record with `base`; a container is cloned the first
 * time it is written. The base state is never touched, so an action can validate
 * and apply in one pass and simply be discarded on error.
 */
export interface Draft {
  readonly base: GameState;
  readonly state: Mutable<GameState>;
  readonly events: GameEvent[];
}

export function createDraft(base: GameState): Draft {
  return { base, state: { ...base }, events: [] };
}

type TileArrayKey = 'owner' | 'capture' | 'occupant';

export function writableTiles(draft: Draft, key: TileArrayKey): number[] {
  if (draft.state[key] === draft.base[key]) draft.state[key] = draft.base[key].slice();
  return draft.state[key] as number[];
}

function writableUnits(draft: Draft): Record<UnitId, Unit> {
  if (draft.state.units === draft.base.units) draft.state.units = { ...draft.base.units };
  return draft.state.units as Record<UnitId, Unit>;
}

export function patchUnit(draft: Draft, id: UnitId, patch: Partial<Unit>): Unit {
  const units = writableUnits(draft);
  const next: Unit = { ...units[id]!, ...patch };
  units[id] = next;
  return next;
}

export function addUnit(draft: Draft, unit: Unit): void {
  writableUnits(draft)[unit.id] = unit;
}

function deleteUnit(draft: Draft, id: UnitId): void {
  delete writableUnits(draft)[id];
}

export function patchPlayer(draft: Draft, index: PlayerIndex, patch: Partial<Player>): void {
  if (draft.state.players === draft.base.players) draft.state.players = draft.base.players.slice();
  const players = draft.state.players as Player[];
  players[index] = { ...players[index]!, ...patch };
}

function resetCapture(ruleset: CompiledRuleset, draft: Draft, tile: TileIndex): void {
  if (draft.state.capture[tile] !== ruleset.rules.capturePoints) {
    writableTiles(draft, 'capture')[tile] = ruleset.rules.capturePoints;
  }
}

/**
 * Moves a unit along an already-validated path, spending `cost` fuel. Leaving a
 * tile abandons any capture in progress there. With `occupyDestination` false the
 * unit leaves the map grid (it is about to join or board the unit at the end).
 */
export function relocateUnit(
  ruleset: CompiledRuleset,
  draft: Draft,
  unit: Unit,
  path: readonly TileIndex[],
  cost: number,
  occupyDestination: boolean,
): Unit {
  if (path.length === 0) return unit;
  const from = unit.pos;
  const to = path[path.length - 1]!;
  const moved = patchUnit(draft, unit.id, { pos: to, fuel: unit.fuel - cost });
  if (from !== to) {
    const occupant = writableTiles(draft, 'occupant');
    occupant[from] = NO_UNIT;
    if (occupyDestination) occupant[to] = unit.id;
    resetCapture(ruleset, draft, from);
  }
  draft.events.push({ type: 'UnitMoved', unit: unit.id, from, path });
  return moved;
}

/** Removes a unit and its cargo from play without checking for a rout. */
export function removeUnit(ruleset: CompiledRuleset, draft: Draft, id: UnitId): void {
  const unit = draft.state.units[id]!;
  for (const cargoId of unit.cargo) removeUnit(ruleset, draft, cargoId);
  if (unit.pos !== NO_TILE && draft.state.occupant[unit.pos] === id) {
    writableTiles(draft, 'occupant')[unit.pos] = NO_UNIT;
    resetCapture(ruleset, draft, unit.pos);
  }
  deleteUnit(draft, id);
}

function hasUnits(state: GameState, player: PlayerIndex): boolean {
  const units = state.units;
  for (const key in units) {
    if (units[key as unknown as UnitId]!.owner === player) return true;
  }
  return false;
}

/** Destroys a unit in combat. Its owner is routed if that was their last unit. */
export function destroyUnit(ruleset: CompiledRuleset, draft: Draft, id: UnitId): void {
  const unit = draft.state.units[id]!;
  draft.events.push({ type: 'UnitDestroyed', unit: id, at: unit.pos });
  removeUnit(ruleset, draft, id);
  if (!hasUnits(draft.state, unit.owner)) {
    defeatPlayer(ruleset, draft, unit.owner, 'rout', NO_OWNER);
  }
}

/**
 * Eliminates a player: their units are removed and their properties pass to
 * `heir` (or become neutral). Ends the game if one player remains.
 */
export function defeatPlayer(
  ruleset: CompiledRuleset,
  draft: Draft,
  player: PlayerIndex,
  reason: WinReason,
  heir: PlayerIndex,
): void {
  if (!draft.state.players[player]!.alive) return;
  patchPlayer(draft, player, { alive: false });

  const units = draft.state.units;
  for (const key in units) {
    const unit = units[key as unknown as UnitId];
    // Cargo may already have been removed along with its transport.
    if (unit !== undefined && unit.owner === player && draft.state.units[unit.id] !== undefined) {
      removeUnit(ruleset, draft, unit.id);
    }
  }

  const owner = writableTiles(draft, 'owner');
  for (let tile = 0; tile < owner.length; tile++) {
    if (owner[tile] === player) {
      owner[tile] = heir;
      resetCapture(ruleset, draft, tile);
    }
  }
  draft.events.push({ type: 'PlayerDefeated', player, reason });

  let survivor = NO_OWNER;
  let aliveCount = 0;
  const players = draft.state.players;
  for (let i = 0; i < players.length; i++) {
    if (players[i]!.alive) {
      aliveCount++;
      survivor = i;
    }
  }
  if (aliveCount === 1) {
    draft.state.status = { kind: 'won', winner: survivor, reason };
    draft.events.push({ type: 'GameWon', winner: survivor, reason });
  }
}

/** Refills a unit's fuel and ammo. Returns true if anything changed. */
export function resupplyUnit(ruleset: CompiledRuleset, draft: Draft, id: UnitId): boolean {
  const unit = draft.state.units[id]!;
  const def = ruleset.units[unit.type]!;
  if (unit.fuel === def.maxFuel && unit.ammo === def.maxAmmo) return false;
  patchUnit(draft, id, { fuel: def.maxFuel, ammo: def.maxAmmo });
  return true;
}

const neighbourScratch = new Int32Array(4);

/**
 * Resupplies every friendly unit adjacent to `tile`, appending the tiles of all
 * adjacent friendly units to `targets`. Returns the number of adjacent friendlies.
 */
export function supplyAdjacent(
  ruleset: CompiledRuleset,
  draft: Draft,
  tile: TileIndex,
  owner: PlayerIndex,
  targets: TileIndex[],
): number {
  const count = neighbours(tile, draft.state.width, draft.state.height, neighbourScratch);
  let found = 0;
  for (let i = 0; i < count; i++) {
    const next = neighbourScratch[i]!;
    const occupantId = draft.state.occupant[next]!;
    if (occupantId === NO_UNIT || draft.state.units[occupantId]!.owner !== owner) continue;
    resupplyUnit(ruleset, draft, occupantId);
    targets.push(next);
    found++;
  }
  return found;
}
