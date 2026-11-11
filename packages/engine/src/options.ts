import { weaponBaseDamage } from './combat';
import { NO_DAMAGE, type CompiledRuleset } from './ruleset';
import { NO_UNIT, type GameState, type TileIndex, type Unit } from './types';
import { isIndirect } from './units';

/**
 * Lists what the rules allow, for menus and (later) the AI. These functions use
 * the same predicates as the reducer, which remains the final authority.
 */

/**
 * Tiles holding enemies that `unit` could attack from `from`. `hasMoved` is
 * whether reaching `from` used movement, which rules out indirect fire.
 */
export function attackTargetsFrom(
  ruleset: CompiledRuleset,
  state: GameState,
  unit: Unit,
  from: TileIndex,
  hasMoved: boolean,
): TileIndex[] {
  const targets: TileIndex[] = [];
  const def = ruleset.units[unit.type]!;
  if (def.maxRange === 0) return targets;
  if (hasMoved && isIndirect(ruleset, unit.type)) return targets;

  const { width, height, occupant, units } = state;
  const fx = from % width;
  const fy = (from / width) | 0;
  const { minRange, maxRange } = def;

  for (let dy = -maxRange; dy <= maxRange; dy++) {
    const y = fy + dy;
    if (y < 0 || y >= height) continue;
    const span = maxRange - (dy < 0 ? -dy : dy);
    for (let dx = -span; dx <= span; dx++) {
      const x = fx + dx;
      if (x < 0 || x >= width) continue;
      const distance = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
      if (distance < minRange) continue;
      const tile = y * width + x;
      const targetId = occupant[tile]!;
      if (targetId === NO_UNIT) continue;
      const target = units[targetId]!;
      if (target.owner === unit.owner) continue;
      if (weaponBaseDamage(ruleset, unit.type, unit.ammo, target.type) === NO_DAMAGE) continue;
      targets.push(tile);
    }
  }
  return targets;
}
