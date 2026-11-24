import { session } from '../session/game';

/**
 * Asks before discarding a game in progress that has moves in it. A finished
 * game, or one nobody has moved in yet, is replaced without asking.
 */
export function confirmReplace(): boolean {
  return (
    session.actionCount === 0 ||
    session.getState().status.kind !== 'playing' ||
    window.confirm('Replace the current game? Moves not saved to a slot or file will be lost.')
  );
}
