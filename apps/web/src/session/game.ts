import { DEFAULT_MAP_ID, maps, ruleset as rawRuleset } from '@tactics/content';
import { compileRuleset } from '@tactics/engine';
import { GameSession, newGameRecord } from './gameSession';

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/** The compiled ruleset and the single running game for this page. */
export const ruleset = compileRuleset(rawRuleset);
export const session = new GameSession(
  ruleset,
  newGameRecord(ruleset, maps.get(DEFAULT_MAP_ID), randomSeed()),
);

export function startNewGame(mapId: string = DEFAULT_MAP_ID): void {
  session.load(newGameRecord(ruleset, maps.get(mapId), randomSeed()));
}
