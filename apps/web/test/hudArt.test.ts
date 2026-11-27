import { FALLBACK_SPRITES, ruleset as rawRuleset } from '@tactics/content';
import { compileRuleset } from '@tactics/engine';
import { sprites } from '@tactics/sprites';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, iconSprite } from '../src/ui/icons';
import { terrainArt, unitArt } from '../src/ui/spriteArt';

const ruleset = compileRuleset(rawRuleset);
const placeholders = new Set<string>(Object.values(FALLBACK_SPRITES));

/** The sprite the interface would draw: the first of `ids` that has art. */
function drawn(ids: readonly string[]): string | undefined {
  return sprites.resolve(ids)?.id;
}

describe('art in the interface', () => {
  it('has a sprite for every icon', () => {
    for (const name of ICON_NAMES) {
      expect(sprites.has(iconSprite(name)), `icon.${name}`).toBe(true);
    }
  });

  it('shows the capture flag in its owner’s colours', () => {
    expect(sprites.get(iconSprite('capture')).team).toBe(true);
  });

  it('shows every unit by its own art in menus and info cards', () => {
    for (let type = 0; type < ruleset.units.length; type++) {
      const id = drawn(unitArt(ruleset, type));
      expect(id, ruleset.units[type]!.id).toBeDefined();
      expect(placeholders.has(id!), `${ruleset.units[type]!.id} shows a placeholder`).toBe(false);
    }
  });

  it('shows every terrain by its own art, autotiled terrain by a sample piece', () => {
    for (let type = 0; type < ruleset.terrain.length; type++) {
      const id = drawn(terrainArt(ruleset, type));
      expect(id, ruleset.terrain[type]!.id).toBeDefined();
      expect(placeholders.has(id!), `${ruleset.terrain[type]!.id} shows a placeholder`).toBe(false);
    }
    expect(drawn(terrainArt(ruleset, ruleset.terrainIndex.get('road')!))).toBe('terrain.road.10');
    expect(drawn(terrainArt(ruleset, ruleset.terrainIndex.get('bridge')!))).toBe(
      'terrain.bridge.h',
    );
  });

  it('falls back to placeholder art for content without any', () => {
    const custom = { ...ruleset, units: [{ ...ruleset.units[0]!, id: 'hovercraft' }] };
    expect(drawn(unitArt(custom, 0))).toBe(FALLBACK_SPRITES.unit);
  });
});
