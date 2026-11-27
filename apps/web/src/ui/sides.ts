import { incomeOf, type CompiledRuleset, type GameState, type PlayerIndex } from '@tactics/engine';

/** What the commanders card shows for one side. */
export interface SideStats {
  readonly funds: number;
  /** Funds collected at the start of each turn, after commander modifiers. */
  readonly income: number;
  readonly properties: number;
  /** Units in play, including any carried in transports. */
  readonly units: number;
}

export function sideStats(
  ruleset: CompiledRuleset,
  state: GameState,
  seat: PlayerIndex,
): SideStats {
  let properties = 0;
  for (const owner of state.owner) if (owner === seat) properties++;
  let units = 0;
  for (const unit of Object.values(state.units)) if (unit.owner === seat) units++;
  return {
    funds: state.players[seat]!.funds,
    income: incomeOf(ruleset, state, seat),
    properties,
    units,
  };
}
