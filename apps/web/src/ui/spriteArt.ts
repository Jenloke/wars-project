import { MASK_EAST, MASK_WEST, terrainVisual, unitVisual } from '@tactics/content';
import type { CompiledRuleset } from '@tactics/engine';

/**
 * Which sprite shows a unit or a terrain type in the interface, with its
 * fallbacks, by the same visual data the renderer uses. A new unit or building
 * appears in menus and info cards as soon as it has art, and as a placeholder
 * until then.
 */

/** A road or bridge running east to west: how autotiled terrain is shown on its own. */
const SAMPLE_MASK = MASK_EAST | MASK_WEST;

export function unitArt(ruleset: CompiledRuleset, unitType: number): readonly string[] {
  const unit = ruleset.units[unitType]!;
  const visual = unitVisual(unit.id, ruleset.moveTypes[unit.moveType]!);
  return [visual.sprite, visual.fallback];
}

export function terrainArt(ruleset: CompiledRuleset, terrainType: number): readonly string[] {
  const terrain = ruleset.terrain[terrainType]!;
  const visual = terrainVisual(terrain.id, terrain.isProperty);
  if (visual.autotile === undefined) return [visual.sprite, visual.fallback];
  const variant = visual.autotile.variants?.[SAMPLE_MASK] ?? `${visual.sprite}.${SAMPLE_MASK}`;
  return [variant, visual.fallback];
}
