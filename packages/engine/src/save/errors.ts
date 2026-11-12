/**
 * Why a save could not be loaded:
 * - `malformed`: not a save file, or a field has the wrong shape
 * - `unsupportedVersion`: written by a newer build, or too old to migrate
 * - `rulesetMismatch`: written with different game rules, so its log cannot replay
 * - `corrupt`: well formed, but the action log does not reproduce the saved state
 */
export type SaveErrorCode = 'malformed' | 'unsupportedVersion' | 'rulesetMismatch' | 'corrupt';

/** A save that cannot be loaded. The message is written for players. */
export class SaveError extends Error {
  override readonly name = 'SaveError';

  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
  }
}
