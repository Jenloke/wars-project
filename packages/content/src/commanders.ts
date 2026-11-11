import type { RawCommanderDef } from '@tactics/engine';

/**
 * Index 0 is the default commander with no modifiers. Real commanders are added
 * here as data in a later phase; the engine already applies their modifiers.
 */
export const commanders: readonly RawCommanderDef[] = [
  { id: 'none', name: 'Field Officer', modifiers: [] },
];
