import {
  migrateSave,
  restoreSave,
  SAVE_FORMAT,
  SAVE_VERSION,
  SaveError,
  type Action,
  type ActionType,
  type CompiledRuleset,
  type GameState,
  type RestoredGame,
  type SaveData,
} from '@tactics/engine';
import { z } from 'zod';
import { validateMap } from './maps/registry';
import { ruleset as contentRuleset } from './ruleset';
import { mapSchema } from './schemas';

/**
 * Bounds that keep a hostile file from making the loader do unbounded work. Each
 * is far above anything legal play produces.
 */
const MAX_PATH_LENGTH = 64;
const MAX_DROPS = 8;
const MAX_ACTIONS = 200_000;

const tile = z.number().int().nonnegative();
const unitId = z.number().int().nonnegative();
const path = z.array(tile).max(MAX_PATH_LENGTH);

/**
 * One schema per action type. The `satisfies` clause fails to compile if an
 * action type is added to the engine without a schema here.
 */
const actionSchemas = {
  Move: z.object({ type: z.literal('Move'), unit: unitId, path }),
  Attack: z.object({ type: z.literal('Attack'), unit: unitId, path, target: tile }),
  Capture: z.object({ type: z.literal('Capture'), unit: unitId, path }),
  Join: z.object({ type: z.literal('Join'), unit: unitId, path }),
  Load: z.object({ type: z.literal('Load'), unit: unitId, path }),
  Unload: z.object({
    type: z.literal('Unload'),
    unit: unitId,
    path,
    drops: z
      .array(z.object({ cargo: unitId, to: tile }))
      .min(1)
      .max(MAX_DROPS),
  }),
  Supply: z.object({ type: z.literal('Supply'), unit: unitId, path }),
  Build: z.object({ type: z.literal('Build'), at: tile, unitType: z.number().int().nonnegative() }),
  EndTurn: z.object({ type: z.literal('EndTurn') }),
  Resign: z.object({ type: z.literal('Resign') }),
} satisfies { readonly [K in ActionType]: z.ZodType<Extract<Action, { type: K }>> };

export const actionSchema = z.discriminatedUnion('type', [
  actionSchemas.Move,
  actionSchemas.Attack,
  actionSchemas.Capture,
  actionSchemas.Join,
  actionSchemas.Load,
  actionSchemas.Unload,
  actionSchemas.Supply,
  actionSchemas.Build,
  actionSchemas.EndTurn,
  actionSchemas.Resign,
]);

const setupSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  players: z
    .array(
      z.object({
        controller: z.enum(['local', 'ai', 'remote']),
        commander: z.string().min(1).optional(),
      }),
    )
    .min(2)
    .max(4),
});

/**
 * The snapshot is passed through untouched: `restoreSave` compares it with the
 * replayed log byte for byte, which is a stricter check than any schema.
 */
const stateSnapshot = z.custom<GameState>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  'state must be an object',
);

export const saveSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  version: z.literal(SAVE_VERSION),
  rulesetId: z.string().min(1),
  savedAt: z.string(),
  map: mapSchema,
  setup: setupSchema,
  actions: z.array(actionSchema).max(MAX_ACTIONS),
  state: stateSnapshot,
});

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'unknown problem';
  const where = issue.path.map(String).join('.');
  return where === '' ? issue.message : `${where}: ${issue.message}`;
}

/**
 * Turns the text of a save file into a playable game: parse, migrate to the
 * current format, validate the shape and the map, then replay and verify the log.
 * Throws a `SaveError` with a player-facing message at the first problem.
 *
 * `ruleset` must be compiled from this package's ruleset.
 */
export function readSave(text: string, ruleset: CompiledRuleset): RestoredGame {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new SaveError('malformed', 'The file is not valid JSON.');
  }

  const parsed = saveSchema.safeParse(migrateSave(document));
  if (!parsed.success) {
    throw new SaveError('malformed', `The save is damaged (${describeIssue(parsed.error)}).`);
  }
  const save: SaveData = parsed.data;

  // The map is validated against this build's rules, so only when the save uses
  // them; otherwise restoreSave reports the ruleset mismatch.
  if (save.rulesetId === ruleset.id) {
    const problems = validateMap(save.map, contentRuleset);
    if (problems.length > 0) {
      throw new SaveError('malformed', `The saved map is invalid: ${problems[0]}`);
    }
  }
  return restoreSave(ruleset, save);
}
