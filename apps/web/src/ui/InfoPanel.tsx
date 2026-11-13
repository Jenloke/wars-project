import { factions } from '@tactics/content';
import {
  hpPips,
  maxPips,
  NO_OWNER,
  NO_TILE,
  NO_UNIT,
  previewAttack,
  type GameState,
  type TileIndex,
} from '@tactics/engine';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';

const MAX_STARS = 4;

function ownerName(owner: number): string {
  return owner === NO_OWNER ? 'Neutral' : (factions[owner]?.name ?? `Player ${owner + 1}`);
}

function ownerColor(owner: number): string | undefined {
  return owner === NO_OWNER ? undefined : factions[owner]?.color;
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
            <dd style={{ color: ownerColor(owner) }}>{ownerName(owner)}</dd>
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
  return (
    <section className="info-card">
      <h2 style={{ color: ownerColor(unit.owner) }}>{def.name}</h2>
      <dl>
        <dt>HP</dt>
        <dd>
          {hpPips(ruleset, unit.hp)} / {maxPips(ruleset)}
        </dd>
        <dt>Fuel</dt>
        <dd>
          {unit.fuel} / {def.maxFuel}
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
              {def.minRange === def.maxRange ? def.minRange : `${def.minRange}-${def.maxRange}`}
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
        {unit.moved && unit.owner === state.activePlayer && (
          <>
            <dt>Status</dt>
            <dd>Done</dd>
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

/** Terrain and unit details for the tile under the cursor. */
export function InfoPanel() {
  const state = useGameState();
  const cursor = useUiStore((ui) => ui.cursor);
  const mode = useUiStore((ui) => ui.mode);
  if (cursor === NO_TILE || cursor >= state.terrain.length) return <aside className="info-panel" />;
  return (
    <aside className="info-panel">
      {mode === 'targeting' && <DamagePreview state={state} />}
      <UnitInfo state={state} tile={cursor} />
      <TerrainInfo state={state} tile={cursor} />
    </aside>
  );
}
