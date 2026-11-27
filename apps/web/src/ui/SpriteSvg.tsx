import {
  GRID,
  NEUTRAL_VARIANT,
  sprites,
  TEAM_RAMPS,
  type Sprite,
  type TeamRamp,
} from '@tactics/sprites';
import { iconSprite, type IconName } from './icons';

/** A sprite's polygons, ready to write as SVG. */
interface Shape {
  readonly points: string;
  readonly fill: string;
  /** Index into a team ramp, or -1. */
  readonly team: number;
  /** Opacity in single-colour mode: lighter shades are more opaque. */
  readonly tone: number;
}

const shapes = new WeakMap<Sprite, readonly Shape[]>();

function luminance(rgb: number): number {
  return 0.2126 * ((rgb >> 16) & 255) + 0.7152 * ((rgb >> 8) & 255) + 0.0722 * (rgb & 255);
}

function shapesOf(sprite: Sprite): readonly Shape[] {
  let cached = shapes.get(sprite);
  if (cached !== undefined) return cached;
  const polygons = sprite.frames[0]!.polygons;
  const lights = polygons.map((polygon) => luminance(polygon.rgb));
  const darkest = Math.min(...lights);
  const span = Math.max(...lights) - darkest;
  cached = polygons.map((polygon, i) => ({
    points: polygon.points.join(' '),
    fill: `#${polygon.rgb.toString(16).padStart(6, '0')}`,
    team: polygon.team,
    tone: span === 0 ? 1 : 0.45 + (0.55 * (lights[i]! - darkest)) / span,
  }));
  shapes.set(sprite, cached);
  return cached;
}

interface SpriteSvgProps {
  /** Sprite IDs to try in order; the first with art is drawn. */
  readonly sprite: string | readonly string[];
  /** Team colours for team-coloured surfaces. Neutral if omitted. */
  readonly ramp?: TeamRamp | undefined;
  /** CSS size. Defaults to 1em, so it scales with the text around it. */
  readonly size?: number | string | undefined;
  /** Draws every polygon in the current text colour, shaded by its lightness. */
  readonly mono?: boolean | undefined;
  /** Mirrors it, as the map does for units facing left. */
  readonly flip?: boolean | undefined;
  /** Accessible name. Omit when the sprite is beside text that says the same. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * A sprite drawn in the page as vector SVG: the same art as the map, sharp at
 * any size. Draws nothing if none of the IDs has art.
 */
export function SpriteSvg({
  sprite,
  ramp,
  size = '1em',
  mono,
  flip,
  label,
  className,
}: SpriteSvgProps) {
  const art = sprites.resolve(typeof sprite === 'string' ? [sprite] : sprite);
  if (art === undefined) return null;
  const colours = ramp ?? TEAM_RAMPS[NEUTRAL_VARIANT]!;
  return (
    <svg
      className={className === undefined ? 'sprite' : `sprite ${className}`}
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable="false"
    >
      <g transform={flip ? `matrix(-1 0 0 1 ${GRID} 0)` : undefined}>
        {shapesOf(art).map((shape, i) => (
          <polygon
            key={i}
            points={shape.points}
            fill={mono ? 'currentColor' : shape.team >= 0 ? colours[shape.team] : shape.fill}
            fillOpacity={mono && shape.tone < 1 ? shape.tone : undefined}
          />
        ))}
      </g>
    </svg>
  );
}

interface IconProps extends Omit<SpriteSvgProps, 'sprite'> {
  readonly name: IconName;
}

/** An interface icon (see `icons.ts`). */
export function Icon({ name, ...props }: IconProps) {
  return <SpriteSvg sprite={iconSprite(name)} {...props} />;
}
