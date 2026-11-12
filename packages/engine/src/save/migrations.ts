import { SaveError } from './errors';
import { SAVE_FORMAT, SAVE_VERSION } from './format';

/** A raw JSON save document, before validation. */
export type SaveDocument = Readonly<Record<string, unknown>>;

/** Upgrades a save document from version N to version N + 1. */
export type SaveMigration = (save: SaveDocument) => SaveDocument;

export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

/**
 * Upgrade steps, keyed by the version they upgrade *from*. Version 1 is the first
 * format, so there is nothing to migrate yet. To change the format:
 *
 *   1. bump `SAVE_VERSION` to N + 1,
 *   2. add `[N]: (save) => ({ ...save, version: N + 1, ...changed fields })`,
 *   3. add a test that loads a version N save.
 *
 * Steps work on raw JSON, so they never depend on the current TypeScript types.
 */
export const SAVE_MIGRATIONS: SaveMigrations = {};

function isDocument(value: unknown): value is SaveDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Brings a parsed save document up to `target`, one step at a time. Returns the
 * document unchanged if it is already current. The result still needs schema
 * validation.
 */
export function migrateSave(
  document: unknown,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
  target: number = SAVE_VERSION,
): SaveDocument {
  if (!isDocument(document) || document['format'] !== SAVE_FORMAT) {
    throw new SaveError('malformed', 'This file is not a saved game.');
  }
  const version = document['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveError('malformed', 'The save has no valid format version.');
  }
  if (version > target) {
    throw new SaveError(
      'unsupportedVersion',
      `This save is from a newer version of the game (format ${version}; this build reads up to ${target}).`,
    );
  }

  let current = document;
  for (let from = version; from < target; from++) {
    const step = migrations[from];
    if (step === undefined) {
      throw new SaveError('unsupportedVersion', `Saves in format ${from} can no longer be loaded.`);
    }
    current = step(current);
    if (current['version'] !== from + 1) {
      throw new Error(`Save migration from format ${from} did not produce format ${from + 1}`);
    }
  }
  return current;
}
