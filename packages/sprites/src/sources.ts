import { SpriteLibrary } from './library';

/**
 * Every SVG under `svg/`, bundled as text. Adding a sprite is adding a file: it is
 * picked up here with no build step or registration.
 */
const files = import.meta.glob<string>('./svg/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const ROOT = './svg/';

/** The game's sprites, parsed and checked against the art rules once at startup. */
export const sprites: SpriteLibrary = SpriteLibrary.fromSources(
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(ROOT.length), text])),
);
