import type { RawCommanderDef } from '@tactics/engine';
import { z } from 'zod';

/**
 * The commanders, in selection order. Index 0 is the default commander with no
 * abilities. Players store commanders by index, so new ones are only appended.
 */
export const commanders: readonly RawCommanderDef[] = [
  { id: 'none', name: 'Field Officer', modifiers: [] },
];

/** Team colours: light, mid, dark, deep, as the sprite team placeholders expect. */
export type TeamColors = readonly [light: string, mid: string, dark: string, deep: string];

/** How a commander is presented. Rules live in `commanders`; this is the rest. */
export interface CommanderProfile {
  /** Rank or calling, shown under the name. */
  readonly title: string;
  readonly bio: string;
  /** Name of the innate ability. Omitted by a commander with none. */
  readonly innate?: string | undefined;
  /** The army the commander leads. Omitted to play under the seat's faction. */
  readonly army?: string | undefined;
  /** That army's colours. Omitted to keep the seat's faction colours. */
  readonly colors?: TeamColors | undefined;
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/, 'Colours are #rrggbb in lower case');

const profileSchema = z.object({
  title: z.string().min(1),
  bio: z.string().min(1),
  innate: z.string().min(1).optional(),
  army: z.string().min(1).optional(),
  colors: z.tuple([hex, hex, hex, hex]).optional(),
});

/** Profiles by commander ID, validated once at import. */
export const commanderProfiles: Readonly<Record<string, CommanderProfile>> = z
  .record(z.string(), profileSchema)
  .parse({
    none: {
      title: 'Field officer',
      bio: 'Fights by the book, with no innate ability and no power.',
    },
  } satisfies Record<string, CommanderProfile>);

const UNKNOWN_PROFILE: CommanderProfile = { title: 'Commander', bio: 'No briefing on file.' };

/** The profile of commander `id`, or a plain one for a commander that has none. */
export function commanderProfile(id: string): CommanderProfile {
  return commanderProfiles[id] ?? UNKNOWN_PROFILE;
}
