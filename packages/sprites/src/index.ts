/** Public API of the sprites package. */
export {
  FACTION_COUNT,
  NEUTRAL_VARIANT,
  TEAM_PLACEHOLDERS,
  TEAM_RAMPS,
  palette,
  teamRamp,
  type TeamRamp,
} from './palette';
export { SpriteLibrary, spriteIdOf, type Sprite } from './library';
export { rasterize, type RasterOptions } from './raster';
export { sprites } from './sources';
export { GRID, hexToRgb, parseSpriteSvg, type Polygon, type SpriteFrame } from './svg';
