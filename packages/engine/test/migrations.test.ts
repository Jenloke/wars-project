import { describe, expect, it } from 'vitest';
import {
  migrateSave,
  SAVE_FORMAT,
  SAVE_VERSION,
  SaveError,
  type SaveDocument,
  type SaveErrorCode,
} from '../src/index';

function expectRejected(load: () => unknown, code: SaveErrorCode, message: RegExp): void {
  try {
    load();
  } catch (error) {
    if (!(error instanceof SaveError)) throw error;
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    return;
  }
  throw new Error('Expected the save to be rejected');
}

describe('save migrations', () => {
  const v1: SaveDocument = { format: SAVE_FORMAT, version: 1, payload: 'a' };

  it('returns a current save unchanged', () => {
    expect(migrateSave(v1, {}, 1)).toBe(v1);
  });

  it('applies each step in order up to the target version', () => {
    const migrations = {
      1: (save: SaveDocument) => ({ ...save, version: 2, steps: ['1-2'] }),
      2: (save: SaveDocument) => ({
        ...save,
        version: 3,
        steps: [...(save['steps'] as string[]), '2-3'],
      }),
    };
    expect(migrateSave(v1, migrations, 3)).toEqual({
      format: SAVE_FORMAT,
      version: 3,
      payload: 'a',
      steps: ['1-2', '2-3'],
    });
  });

  it('refuses saves from a newer build and versions with no upgrade path', () => {
    expectRejected(() => migrateSave({ ...v1, version: 2 }, {}, 1), 'unsupportedVersion', /newer/);
    const onlyFirstStep = { 1: (save: SaveDocument) => ({ ...save, version: 2 }) };
    expectRejected(
      () => migrateSave(v1, onlyFirstStep, 3),
      'unsupportedVersion',
      /format 2 can no longer/,
    );
  });

  it('refuses documents that are not saves', () => {
    for (const document of [null, 42, 'save', [], {}, { format: 'other', version: 1 }]) {
      expectRejected(() => migrateSave(document), 'malformed', /not a saved game/);
    }
    for (const version of [undefined, 0, 1.5, '1']) {
      expectRejected(() => migrateSave({ format: SAVE_FORMAT, version }), 'malformed', /version/);
    }
  });

  it('fails loudly on a migration that forgets to bump the version', () => {
    const broken = { 1: (save: SaveDocument) => ({ ...save }) };
    expect(() => migrateSave(v1, broken, 2)).toThrow(/did not produce format 2/);
  });

  it('has an upgrade step for every version below the current one', () => {
    const current = { format: SAVE_FORMAT, version: SAVE_VERSION };
    expect(migrateSave(current)).toBe(current);
  });
});
