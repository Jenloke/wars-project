import type { CompiledRuleset, GameEvent, GameState } from '@tactics/engine';

/**
 * Names of the units an action's events say ran out of fuel and were lost. The
 * names come from the state before the action, since the units are gone after it.
 */
export function unitsLostToFuel(
  ruleset: CompiledRuleset,
  previous: GameState,
  events: readonly GameEvent[],
): string[] {
  const names: string[] = [];
  for (const event of events) {
    if (event.type !== 'UnitDestroyed' || event.cause !== 'fuel') continue;
    const unit = previous.units[event.unit];
    if (unit !== undefined) names.push(ruleset.units[unit.type]!.name);
  }
  return names;
}
