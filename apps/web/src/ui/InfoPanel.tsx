import {
  hpPips,
  maxPips,
  maxRangeOf,
  movePointsOf,
  NO_OWNER,
  NO_TILE,
  NO_UNIT,
  type GameState,
  type TileIndex,
} from '@tactics/engine';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';

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

/** Terrain and unit details for the tile under the cursor. */
export function InfoPanel() {
  const state = useGameState();
  const cursor = useUiStore((ui) => ui.cursor);
  if (cursor === NO_TILE || cursor >= state.terrain.length) return null;
  return (
    <aside className="info-panel">
      <UnitInfo state={state} tile={cursor} />
      <TerrainInfo state={state} tile={cursor} />
    </aside>
  );
}
