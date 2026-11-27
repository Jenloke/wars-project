import type { GameState, PlayerIndex } from '@tactics/engine';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { Icon } from './SpriteSvg';

interface PowerGaugeProps {
  readonly state: GameState;
  readonly player: PlayerIndex;
  /** A bare bar, for a side shown by its portrait alone. */
  readonly compact?: boolean | undefined;
}

/**
 * A side's power meter, filled in its army's colour, or the name of its power
 * while it is active. Nothing for a commander without a power.
 */
export function PowerGauge({ state, player, compact }: PowerGaugeProps) {
  const side = state.players[player]!;
  const power = ruleset.commanders[side.commander]!.power;
  if (power === null) return null;
  const army = armiesOf(ruleset, state)[player]!;
  if (side.powerActive) {
    return (
      <span
        className={compact ? 'power-active compact' : 'power-active'}
        style={{ borderColor: army.color, color: army.color }}
        title={`${power.name} is active`}
      >
        <Icon name="power" label={compact ? `${power.name} is active` : undefined} />
        {!compact && power.name}
      </span>
    );
  }
  const charge = Math.min(side.power, power.cost);
  const full = charge >= power.cost;
  const classes = ['power-gauge', full && 'full', compact && 'compact'].filter(Boolean).join(' ');
  return (
    <span
      className={classes}
      title={`${power.name}: ${charge.toLocaleString()} / ${power.cost.toLocaleString()}`}
    >
      {!compact && <Icon name="power" />}
      <span
        className="power-track"
        role="meter"
        aria-label={`${power.name} charge`}
        aria-valuemin={0}
        aria-valuemax={power.cost}
        aria-valuenow={charge}
        aria-valuetext={full ? 'Ready' : `${Math.floor((charge * 100) / power.cost)}%`}
      >
        <span
          className="power-fill"
          style={{ width: `${(charge * 100) / power.cost}%`, background: army.color }}
        />
      </span>
    </span>
  );
}
