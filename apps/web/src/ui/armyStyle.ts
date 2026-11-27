import type { CSSProperties } from 'react';

/** An army's accent colour as the `--army` custom property, for its panel's CSS. */
export function armyStyle(color: string): CSSProperties {
  return { '--army': color } as CSSProperties;
}
