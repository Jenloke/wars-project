import { commanderProfile, factions } from '@tactics/content';
import type { CompiledRuleset, GameState, PlayerIndex } from '@tactics/engine';
import { TEAM_RAMPS, type TeamRamp } from '@tactics/sprites';

/** One side of a game as the player sees it: who leads it and in what colours. */
export interface Army {
  readonly seat: PlayerIndex;
  /** Commander ID. */
  readonly commander: string;
  readonly commanderName: string;
  /** Name of the side: the commander's army, or the seat's faction. */
  readonly name: string;
  /** Team colours its units and buildings are drawn in: light, mid, dark, deep. */
  readonly ramp: TeamRamp;
  /** Accent colour for menus and banners. */
  readonly color: string;
  /** Sprite ID of the commander's portrait (it may not exist; see `PORTRAIT_FALLBACK`). */
  readonly portrait: string;
}

/** Drawn for a commander that has no portrait of its own. */
export const PORTRAIT_FALLBACK = 'portrait.unknown';

export function portraitOf(commander: string): string {
  return `portrait.${commander}`;
}

/** The faction colours and names, in seat order, that seats fall back to. */
const FACTION_COUNT = Math.min(factions.length, TEAM_RAMPS.length - 1);

/**
 * The armies of a game whose seats are led by `commanders` (indices into the
 * ruleset), in seat order.
 *
 * A commander who leads an army of its own brings that army's name and colours.
 * If an earlier seat already has those colours (both sides picked the same
 * commander), or the commander has none (the default commander), the seat takes
 * the first faction whose colours are free, starting from its own slot, as every
 * side did before commanders had armies.
 */
export function armiesFor(ruleset: CompiledRuleset, commanders: readonly number[]): Army[] {
  const used = new Set<string>();
  const own = commanders.map((index) => {
    const colors = commanderProfile(ruleset.commanders[index]!.id).colors;
    if (colors === undefined || used.has(colors[1])) return null;
    used.add(colors[1]);
    return colors;
  });

  return commanders.map((index, seat) => {
    const commander = ruleset.commanders[index]!;
    const profile = commanderProfile(commander.id);
    let name = profile.army ?? '';
    let ramp: TeamRamp | null = own[seat] ?? null;
    if (ramp === null) {
      for (let step = 0; step < FACTION_COUNT; step++) {
        const faction = (seat + step) % FACTION_COUNT;
        const candidate = TEAM_RAMPS[faction]!;
        if (used.has(candidate[1])) continue;
        used.add(candidate[1]);
        ramp = candidate;
        name = factions[faction]!.name;
        break;
      }
    }
    // More seats than colours: share the seat's faction rather than fail.
    ramp ??= TEAM_RAMPS[seat % FACTION_COUNT]!;
    if (name === '') name = factions[seat % FACTION_COUNT]?.name ?? `Player ${seat + 1}`;
    return {
      seat,
      commander: commander.id,
      commanderName: commander.name,
      name,
      ramp,
      color: ramp[1],
      portrait: portraitOf(commander.id),
    };
  });
}

let cachedKey = '';
let cachedArmies: Army[] = [];

/**
 * The armies of `state`. Commanders never change during a game, so this is
 * worked out once per game and cached, and is cheap to call every frame.
 */
export function armiesOf(ruleset: CompiledRuleset, state: GameState): readonly Army[] {
  let key = ruleset.id;
  for (const player of state.players) key += `,${player.commander}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedArmies = armiesFor(
      ruleset,
      state.players.map((player) => player.commander),
    );
  }
  return cachedArmies;
}
