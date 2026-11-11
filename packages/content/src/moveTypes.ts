/**
 * Every movement type the game will ever use. Sea, air and lander units arrive in
 * a later phase, but their rows exist in the cost table from the start.
 */
export const moveTypes = ['foot', 'mech', 'tread', 'tire', 'air', 'sea', 'lander'] as const;

export type MoveType = (typeof moveTypes)[number];

export const LAND_MOVE_TYPES: readonly MoveType[] = ['foot', 'mech', 'tread', 'tire'];
