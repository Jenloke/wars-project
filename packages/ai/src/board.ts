import {
  canCounter,
  computeMoveField,
  createMoveField,
  damageBetween,
  isIndirect,
  NO_DAMAGE,
  NO_TILE,
  NO_UNIT,
  UNREACHABLE,
  maxRangeOf,
  unitCost,
  type CompiledRuleset,
  type GameState,
  type MoveField,
  type PlayerIndex,
  type TileIndex,
  type Unit,
  type UnitId,
} from '@tactics/engine';
import { tilesInRange } from './distance';
import type { AiProfile } from './profile';

/**
 * Everything the AI reads from one position before choosing an action. It is
 * rebuilt for every decision, so it always matches the state being played.
 *
 * The AI sees what a player sees: units, terrain, funds. It never reads the RNG
 * state, so it cannot know how an attack's luck roll will land.
 */
export interface Board {
  readonly ruleset: CompiledRuleset;
  readonly state: GameState;
  readonly profile: AiProfile;
  readonly me: PlayerIndex;
  /** The AI's units on the map, by ascending id. */
  readonly mine: readonly Unit[];
  /** Units of living opponents on the map, by ascending id. */
  readonly enemies: readonly Unit[];
  /** Per tile: enemy units that could attack it next turn. */
  readonly attackers: readonly (readonly UnitId[] | undefined)[];
  /** Per tile: 1 if an enemy unit that can capture could stand there next turn. */
  readonly captureReach: Uint8Array;
  /** Funds per property per day, floored so properties matter on maps without income. */
  readonly income: number;
  /** Multiplier on danger. Below 1 while our army outweighs the enemy's, so a winning side presses on. */
  readonly caution: number;
}

/** What a unit is worth: its build cost to its owner. */
export function unitValue(ruleset: CompiledRuleset, state: GameState, unit: Unit): number {
  return unitCost(ruleset, state, unit.owner, unit.type);
}

let threatField: MoveField = createMoveField(0);
const band: TileIndex[] = [];

function addAttacker(
  attackers: (UnitId[] | undefined)[],
  stamp: Int32Array,
  tile: TileIndex,
  id: UnitId,
): void {
  if (stamp[tile] === id) return;
  stamp[tile] = id;
  const list = attackers[tile];
  if (list === undefined) attackers[tile] = [id];
  else list.push(id);
}

/**
 * Marks every tile each enemy could fire on next turn, and every tile an enemy
 * capturer could walk onto. Enemy reach is blocked by our units, as it will be;
 * tiles their own units stand on count as reachable, since those may move first.
 */
function mapThreats(
  ruleset: CompiledRuleset,
  state: GameState,
  enemies: readonly Unit[],
): Pick<Board, 'attackers' | 'captureReach'> {
  const { width, height } = state;
  const tileCount = width * height;
  if (threatField.cost.length !== tileCount) threatField = createMoveField(tileCount);
  const attackers = new Array<UnitId[] | undefined>(tileCount).fill(undefined);
  const captureReach = new Uint8Array(tileCount);
  const stamp = new Int32Array(tileCount).fill(NO_UNIT);

  for (const enemy of enemies) {
    const def = ruleset.units[enemy.type]!;
    const armed = def.maxRange > 0;
    if (!armed && !def.canCapture) continue;

    // Range as the enemy's commander stretches it now.
    const maxRange = maxRangeOf(ruleset, state, enemy.owner, enemy.type);
    if (armed && isIndirect(ruleset, enemy.type)) {
      // Indirect fire cannot follow a move: only the current position counts.
      for (const tile of tilesInRange(enemy.pos, def.minRange, maxRange, width, height, band)) {
        addAttacker(attackers, stamp, tile, enemy.id);
      }
      if (!def.canCapture) continue;
    }

    const cost = computeMoveField(ruleset, state, enemy.id, threatField).cost;
    for (let from = 0; from < tileCount; from++) {
      if (cost[from] === UNREACHABLE) continue;
      if (def.canCapture) captureReach[from] = 1;
      if (!armed || isIndirect(ruleset, enemy.type)) continue;
      for (const tile of tilesInRange(from, def.minRange, maxRange, width, height, band)) {
        addAttacker(attackers, stamp, tile, enemy.id);
      }
    }
  }
  return { attackers, captureReach };
}

export function readBoard(ruleset: CompiledRuleset, state: GameState, profile: AiProfile): Board {
  const me = state.activePlayer;
  const maxHp = ruleset.rules.maxHp;
  const mine: Unit[] = [];
  const enemies: Unit[] = [];
  let myValue = 0;
  let enemyValue = 0;

  // Integer keys enumerate in ascending order, so both lists are sorted by id.
  for (const unit of Object.values(state.units)) {
    if (unit.pos === NO_TILE) continue;
    const worth = (unitValue(ruleset, state, unit) * unit.hp) / maxHp;
    if (unit.owner === me) {
      mine.push(unit);
      myValue += worth;
    } else if (state.players[unit.owner]!.alive) {
      enemies.push(unit);
      enemyValue += worth;
    }
  }

  const ratio = myValue === 0 ? (enemyValue === 0 ? 1 : profile.maxCaution) : enemyValue / myValue;
  const caution = Math.min(profile.maxCaution, Math.max(profile.minCaution, ratio));

  return {
    ruleset,
    state,
    profile,
    me,
    mine,
    enemies,
    ...mapThreats(ruleset, state, enemies),
    income: Math.max(state.incomePerProperty, profile.minIncome),
    caution,
  };
}

/**
 * Average damage, in internal HP, `attacker` deals to `defender` standing on
 * `defenderTile`, over the luck range. 0 if it cannot hit.
 */
export function expectedDamage(
  ruleset: CompiledRuleset,
  state: GameState,
  attacker: Unit,
  attackerHp: number,
  defender: Unit,
  defenderHp: number,
  defenderTile: TileIndex,
): number {
  const low = damageBetween(
    ruleset,
    state,
    attacker,
    attackerHp,
    defender,
    defenderHp,
    defenderTile,
    0,
  );
  if (low === NO_DAMAGE) return 0;
  const high = damageBetween(
    ruleset,
    state,
    attacker,
    attackerHp,
    defender,
    defenderHp,
    defenderTile,
    ruleset.rules.luckMax,
  );
  const average = (low + high) / 2;
  return average < defenderHp ? average : defenderHp;
}

/**
 * Funds `unit` can expect to lose standing on `tile` with `hp` next turn. Each
 * enemy in range is judged by the damage it would deal, less part of what our
 * counterattack would take back. Each enemy fires once a turn and has other
 * targets, so the worst one counts in full and the rest only in part. Never more
 * than the unit is worth. `ignore` leaves one enemy out (a target about to be
 * destroyed).
 */
export function dangerAt(
  board: Board,
  unit: Unit,
  tile: TileIndex,
  hp: number,
  ignore: UnitId = NO_UNIT,
): number {
  const list = board.attackers[tile];
  if (list === undefined || hp <= 0) return 0;
  const { ruleset, state, profile } = board;
  const maxHp = ruleset.rules.maxHp;
  const worth = unitValue(ruleset, state, unit);
  let total = 0;
  let worst = 0;

  for (const id of list) {
    if (id === ignore) continue;
    const enemy = state.units[id];
    if (enemy === undefined) continue;
    const damage = expectedDamage(ruleset, state, enemy, enemy.hp, unit, hp, tile);
    if (damage <= 0) continue;
    let loss = (damage / maxHp) * worth;
    if (hp > damage && canCounter(ruleset, unit, enemy, 1) && !isIndirect(ruleset, enemy.type)) {
      const back = expectedDamage(ruleset, state, unit, hp - damage, enemy, enemy.hp, enemy.pos);
      loss -= (back / maxHp) * unitValue(ruleset, state, enemy) * profile.counterCredit;
    }
    if (loss <= 0) continue;
    total += loss;
    if (loss > worst) worst = loss;
  }
  const danger = worst + profile.extraAttackers * (total - worst);
  const cap = (worth * hp) / maxHp;
  return danger < cap ? danger : cap;
}

let reachField: MoveField = createMoveField(0);

/** Where `unit` can move this turn. The field is shared: the next call overwrites it. */
export function reachOf(board: Board, unit: Unit): MoveField {
  const tileCount = board.state.width * board.state.height;
  if (reachField.cost.length !== tileCount) reachField = createMoveField(tileCount);
  return computeMoveField(board.ruleset, board.state, unit.id, reachField);
}

/** Tiles in `field` where `unit` can end a move and act: empty ones, or its own. */
export function standTiles(board: Board, unit: Unit, field: MoveField): TileIndex[] {
  const tiles: TileIndex[] = [];
  const { occupant } = board.state;
  const cost = field.cost;
  for (let tile = 0; tile < cost.length; tile++) {
    if (cost[tile] === UNREACHABLE) continue;
    const id = occupant[tile]!;
    if (id === NO_UNIT || id === unit.id) tiles.push(tile);
  }
  return tiles;
}
