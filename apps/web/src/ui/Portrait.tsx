import { hexToRgb, rasterize, sprites, type TeamRamp } from '@tactics/sprites';
import { useEffect, useRef } from 'react';
import { PORTRAIT_FALLBACK } from '../session/armies';

interface PortraitProps {
  /** Sprite ID of the portrait; a silhouette is drawn if it has no art. */
  readonly sprite: string;
  /** Team colours to paint it in. */
  readonly ramp: TeamRamp;
  /** Size in CSS pixels. It is rasterized at the display's real resolution. */
  readonly size: number;
  /** Accessible name. Omit for a decorative portrait beside a visible name. */
  readonly label?: string | undefined;
}

/** A commander portrait, rasterized from its vector art like the map sprites. */
export function Portrait({ sprite, ramp, size, label }: PortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rampKey = ramp.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    const art = sprites.resolve([sprite, PORTRAIT_FALLBACK]);
    if (canvas === null || art === undefined) return;
    const pixels = Math.max(1, Math.round(size * (window.devicePixelRatio || 1)));
    canvas.width = pixels;
    canvas.height = pixels;
    const data = rasterize(art.frames[0]!, pixels, { ramp: rampKey.split(',').map(hexToRgb) });
    canvas.getContext('2d')?.putImageData(new ImageData(data, pixels, pixels), 0, 0);
  }, [sprite, rampKey, size]);

  return (
    <canvas
      ref={canvasRef}
      className="portrait"
      style={{ width: size, height: size }}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    />
  );
}
