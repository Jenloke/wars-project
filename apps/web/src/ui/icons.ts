/**
 * The interface icons, by name. Each is the sprite `icon.<name>`, authored like
 * any other sprite (`packages/sprites/src/svg/icon`), so replacing one is
 * replacing its SVG.
 */
export const ICON_NAMES = [
  'ammo',
  'attack',
  'capture',
  'close',
  'computer',
  'day',
  'defence',
  'delete',
  'dive',
  'done',
  'endTurn',
  'export',
  'fuel',
  'funds',
  'hp',
  'human',
  'import',
  'join',
  'load',
  'move',
  'newGame',
  'open',
  'power',
  'range',
  'resign',
  'save',
  'star',
  'starEmpty',
  'supply',
  'surface',
  'trophy',
  'units',
  'wait',
  'zoomIn',
  'zoomOut',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function iconSprite(name: IconName): string {
  return `icon.${name}`;
}
