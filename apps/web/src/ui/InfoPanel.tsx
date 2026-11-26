import {
  hpPips,
  maxPips,
  maxRangeOf,
  movePointsOf,
  NO_OWNER,
  NO_TILE,
  NO_UNIT,
  previewAttack,
  type GameState,
  type TileIndex,
} from '@tactics/engine';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';
import { Portrait } from './Portrait';
import { PowerGauge } from './PowerGauge';

const MAX_STARS = 4;

function ownerName(state: GameState, owner: number): string {
  if (owner === NO_OWNER) return 'Neutral';
  return armiesOf(ruleset, state)[owner]?.name ?? `Player ${owner + 1}`;
}

function ownerColor(state: GameState, owner: number): string | undefined {
  return owner === NO_OWNER ? undefined : armiesOf(ruleset, state)[owner]?.color;
}

/** A stat changed by a commander, with the unmodified value beside it. */
function Modified({ value, base }: { value: string; base: string }) {
  if (value === base) return <>{value}</>;
  return (
    <>
      {value} <span className="muted">({base})</span>
    </>
  );
}

function TerrainInfo({ state, tile }: { state: GameState; tile: TileIndex }) {
  const terrain = ruleset.terrain[state.terrain[tile]!]!;
  const owner = state.owner[tile]!;
  const capture = state.capture[tile]!;
  return (
    <section className="info-card">
      <h2>{terrain.name}</h2>
      <dl>
        <dt>Defence</dt>
        <dd aria-label={`${terrain.defence} of ${MAX_STARS} stars`}>
          {'★'.repeat(terrain.defence)}
          <span className="muted">{'★'.repeat(MAX_STARS - terrain.defence)}</span>
        </dd>
        {terrain.isProperty && (
          <>
            <dt>Owner</dt>
            <dd style={{ color: ownerColor(state, owner) }}>{ownerName(state, owner)}</dd>
            <dt>Capture</dt>
            <dd>
              {capture} / {ruleset.rules.capturePoints}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

function UnitInfo({ state, tile }: { state: GameState; tile: TileIndex }) {
  const id = state.occupant[tile]!;
  const unit = id === NO_UNIT ? undefined : state.units[id];
  if (unit === undefined) {
    return (
      <section className="info-card info-empty">
        <h2>No unit</h2>
      </section>
    );
  }
  const def = ruleset.units[unit.type]!;
  const dailyFuel = unit.dived ? def.divedFuelPerDay : def.fuelPerDay;
  const move = movePointsOf(ruleset, state, unit.owner, unit.type);
  const maxRange = maxRangeOf(ruleset, state, unit.owner, unit.type);
  const range = (max: number) => (def.minRange === max ? `${max}` : `${def.minRange}-${max}`);
  const status = [
    unit.dived && 'Dived',
    unit.moved && unit.owner === state.activePlayer && 'Done',
  ].filter((part) => part !== false);
  return (
    <section className="info-card">
      <h2 style={{ color: ownerColor(state, unit.owner) }}>{def.name}</h2>
      <dl>
        <dt>HP</dt>
        <dd>
          {hpPips(ruleset, unit.hp)} / {maxPips(ruleset)}
        </dd>
        <dt>Move</dt>
        <dd>
          <Modified value={String(move)} base={String(def.movePoints)} />
        </dd>
        <dt>Fuel</dt>
        <dd>
          {unit.fuel} / {def.maxFuel}
          {dailyFuel > 0 && <span className="muted"> · {dailyFuel}/day</span>}
        </dd>
        {def.maxAmmo > 0 && (
          <>
            <dt>Ammo</dt>
            <dd>
              {unit.ammo} / {def.maxAmmo}
            </dd>
          </>
        )}
        {def.maxRange > 0 && (
          <>
            <dt>Range</dt>
            <dd>
              <Modified value={range(maxRange)} base={range(def.maxRange)} />
            </dd>
          </>
        )}
        {unit.cargo.length > 0 && (
          <>
            <dt>Carrying</dt>
            <dd>
              {unit.cargo
                .map((cargoId) => ruleset.units[state.units[cargoId]!.type]!.name)
                .join(', ')}
            </dd>
          </>
        )}
        {def.ignoresTerrainDefence && (
          <>
            <dt>Cover</dt>
            <dd className="muted">None while flying</dd>
          </>
        )}
        {status.length > 0 && (
          <>
            <dt>Status</dt>
            <dd>{status.join(', ')}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function percentRange(min: number, max: number): string {
  const scale = 100 / ruleset.rules.maxHp;
  const low = Math.round(min * scale);
  const high = Math.round(max * scale);
  return low === high ? `${low}%` : `${low}-${high}%`;
}

/** Damage forecast, shown while the player is choosing an attack target. */
function DamagePreview({ state }: { state: GameState }) {
  const cursor = useUiStore((ui) => ui.cursor);
  const unit = useUiStore((ui) => ui.selectedUnit);
  const path = useUiStore((ui) => ui.path);
  const attacker = state.units[unit];
  if (attacker === undefined) return null;
  const from = path.length > 0 ? path[path.length - 1]! : attacker.pos;
  const preview = previewAttack(ruleset, state, unit, from, cursor);
  if (preview === null) return null;
  return (
    <section className="info-card damage-preview" aria-live="polite">
      <h2>Attack forecast</h2>
      <dl>
        <dt>Deal</dt>
        <dd>{percentRange(preview.min, preview.max)}</dd>
        <dt>Take</dt>
        <dd>
          {preview.counterMax === 0
            ? 'No counter'
            : percentRange(preview.counterMin, preview.counterMax)}
        </dd>
      </dl>
    </section>
  );
}

/** Every side still in the game: its commander and how charged their power is. */
function ArmiesInfo({ state }: { state: GameState }) {
  const armies = armiesOf(ruleset, state);
  return (
    <section className="info-card armies-card" aria-label="Commanders">
      <ul>
        {armies.map((army) => {
          const side = state.players[army.seat]!;
          if (!side.alive) return null;
          return (
            <li
              key={army.seat}
              className={army.seat === state.activePlayer ? 'army active' : 'army'}
              title={`${army.commanderName}, ${army.name}`}
            >
              <Portrait sprite={army.portrait} ramp={army.ramp} size={32} />
              <span className="army-text">
                <span className="army-name" style={{ color: army.color }}>
                  {army.commanderName}
                </span>
                <PowerGauge state={state} player={army.seat} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Terrain and unit details for the tile under the cursor, and every side's commander. */
export function InfoPanel() {
  const state = useGameState();
  const cursor = useUiStore((ui) => ui.cursor);
  const mode = useUiStore((ui) => ui.mode);
  if (cursor === NO_TILE || cursor >= state.terrain.length) {
    return (
      <aside className="info-panel">
        <ArmiesInfo state={state} />
      </aside>
    );
  }
  return (
    <aside className="info-panel">
      {mode === 'targeting' && <DamagePreview state={state} />}
      <UnitInfo state={state} tile={cursor} />
      <TerrainInfo state={state} tile={cursor} />
      <ArmiesInfo state={state} />
    </aside>
  );
}
