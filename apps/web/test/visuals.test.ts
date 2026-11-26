import {
  FALLBACK_SPRITES,
  ruleset as rawRuleset,
  terrainVisual,
  unitVisual,
} from '@tactics/content';
import { compileRuleset } from '@tactics/engine';
import { sprites } from '@tactics/sprites';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_FALLBACK, portraitOf } from '../src/session/armies';

const ruleset = compileRuleset(rawRuleset);

describe('art for the shipped content', () => {
  it('gives every unit its own team-coloured sprite with an idle cycle', () => {
    for (const unit of ruleset.units) {
      const visual = unitVisual(unit.id, ruleset.moveTypes[unit.moveType]!);
      const sprite = sprites.find(visual.sprite);
      expect(sprite, `${unit.id} has no sprite "${visual.sprite}"`).toBeDefined();
      expect(sprite!.frames).toHaveLength(2);
      expect(sprite!.team).toBe(true);
    }
  });

  it('gives every terrain its own sprite, or every variant it autotiles to', () => {
    for (const terrain of ruleset.terrain) {
      const visual = terrainVisual(terrain.id, terrain.isProperty);
      if (visual.autotile === undefined) {
        expect(sprites.has(visual.sprite), `${terrain.id}: ${visual.sprite}`).toBe(true);
        // Properties are drawn in their owner's colours.
        expect(sprites.get(visual.sprite).team).toBe(terrain.isProperty);
      } else if (visual.autotile.variants === undefined) {
        for (let mask = 0; mask < 16; mask++) {
          expect(sprites.has(`${visual.sprite}.${mask}`), `${terrain.id} mask ${mask}`).toBe(true);
        }
      } else {
        for (const id of Object.values(visual.autotile.variants)) {
          expect(sprites.has(id), `${terrain.id}: ${id}`).toBe(true);
        }
      }
    }
  });

  it('gives every commander a portrait in team colours, with a silhouette for any without', () => {
    for (const commander of ruleset.commanders) {
      const portrait = sprites.find(portraitOf(commander.id));
      expect(portrait, `${commander.id} has no portrait`).toBeDefined();
      expect(portrait!.team).toBe(true);
    }
    expect(sprites.get(PORTRAIT_FALLBACK).team).toBe(true);
  });

  it('has placeholder art and the markers the renderer draws', () => {
    for (const id of Object.values(FALLBACK_SPRITES)) expect(sprites.has(id)).toBe(true);
    for (const id of ['ui.cursor', 'ui.moveTile', 'ui.attackTile', 'ui.shadow', 'fx.puff']) {
      expect(sprites.has(id)).toBe(true);
    }
    expect(sprites.get('ui.submerged').frames).toHaveLength(2);
  });
});
