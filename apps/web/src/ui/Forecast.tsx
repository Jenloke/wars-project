import { previewAttack } from '@tactics/engine';
import type { CSSProperties } from 'react';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';
import { bubbleBox, openArea, tileBox } from './hudLayout';
import { Icon } from './SpriteSvg';

/** The bubble's size in CSS pixels; the stylesheet lays its content out to fit. */
const BUBBLE = { width: 150, height: 54 } as const;
/** Space between the bubble and the target tile. */
const GAP = 8;

function percentRange(min: number, max: number): string {
  const scale = 100 / ruleset.rules.maxHp;
  const low = Math.round(min * scale);
  const high = Math.round(max * scale);
  return low === high ? `${low}%` : `${low}–${high}%`;
}

/**
 * Damage forecast in a bubble beside the target, while the player chooses
 * whom to attack: what the attack deals, and what the counterattack would.
 */
export function Forecast() {
  const state = useGameState();
  const mode = useUiStore((ui) => ui.mode);
  const cursor = useUiStore((ui) => ui.cursor);
  const unit = useUiStore((ui) => ui.selectedUnit);
  const path = useUiStore((ui) => ui.path);
  const camera = useUiStore((ui) => ui.camera);
  const viewport = useUiStore((ui) => ui.viewport);
  if (mode !== 'targeting') return null;
  const attacker = state.units[unit];
  if (attacker === undefined) return null;
  const from = path.length > 0 ? path[path.length - 1]! : attacker.pos;
  const preview = previewAttack(ruleset, state, unit, from, cursor);
  if (preview === null) return null;

  const target = tileBox(cursor, state.width, camera, viewport);
  const box = bubbleBox(target, BUBBLE, openArea(viewport), GAP);
  const arrow = target.left + target.width / 2 - box.left;
  const lethal = preview.min >= state.units[state.occupant[cursor]!]!.hp;
  return (
    <div
      className={box.below ? 'forecast below' : 'forecast'}
      role="status"
      aria-label="Attack forecast"
      style={
        {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          '--arrow': `${arrow}px`,
        } as CSSProperties
      }
    >
      <div className={lethal ? 'forecast-row lethal' : 'forecast-row'}>
        <Icon name="attack" />
        <span>Deal</span>
        <strong>{lethal ? 'Destroy' : percentRange(preview.min, preview.max)}</strong>
      </div>
      <div className="forecast-row">
        <Icon name="hp" />
        <span>Take</span>
        <strong className={preview.counterMax === 0 ? 'muted' : 'forecast-counter'}>
          {preview.counterMax === 0 ? 'None' : percentRange(preview.counterMin, preview.counterMax)}
        </strong>
      </div>
    </div>
  );
}
