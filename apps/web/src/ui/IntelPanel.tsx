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
  type UnitId,
} from '@tactics/engine';
import { NEUTRAL_VARIANT, TEAM_RAMPS } from '@tactics/sprites';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { armyStyle } from './armyStyle';
import { useGameState } from './hooks';
import { intelSide, tileBox, type Side } from './hudLayout';
import type { IconName } from './icons';
import { shownUnit } from './intel';
import { terrainArt, unitArt } from './spriteArt';
import { Icon, SpriteSvg } from './SpriteSvg';

/** Defence is shown out of this many stars, or more for terrain that gives more. */
const MAX_STARS = 4;
/** Distance from the panel to the board's edges, in CSS pixels. */
const MARGIN = 8;
/** At or below this fraction of its maximum, a supply or HP value is shown as low. */
const LOW_FRACTION = 0.3;

interface StatProps {
  readonly icon: IconName;
  readonly label: string;
  readonly title?: string | undefined;
  readonly low?: boolean | undefined;
  readonly children: ReactNode;
}

/** One stat: an icon naming it, and its value. */
function Stat({ icon, label, title, low, children }: StatProps) {
  return (
    <div className={low ? 'intel-stat low' : 'intel-stat'} title={title ?? label}>
      <dt>
        <Icon name={icon} />
        <span className="visually-hidden">{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

interface ModifiedProps {
  readonly value: string;
  readonly base: string;
  /** True if the commander raised it, false if they lowered it. */
  readonly raised: boolean;
}

/** A stat changed by a commander, with the unmodified value beside it. */
function Modified({ value, base, raised }: ModifiedProps) {
  if (value === base) return <>{value}</>;
  return (
    <>
      <span className={raised ? 'raised' : 'lowered'}>{value}</span>
      <span className="of"> ({base})</span>
    </>
  );
}

function UnitCard({ state, id }: { state: GameState; id: UnitId }) {
  const unit = state.units[id]!;
  const def = ruleset.units[unit.type]!;
  const army = armiesOf(ruleset, state)[unit.owner]!;
  const pips = hpPips(ruleset, unit.hp);
  const dailyFuel = unit.dived ? def.divedFuelPerDay : def.fuelPerDay;
  const move = movePointsOf(ruleset, state, unit.owner, unit.type);
  const maxRange = maxRangeOf(ruleset, state, unit.owner, unit.type);
  const range = (max: number) => (def.minRange === max ? `${max}` : `${def.minRange}–${max}`);
  const done = unit.moved && unit.owner === state.activePlayer;
  const cargo = unit.cargo.map((cargoId) => state.units[cargoId]!);
  return (
    <section className="hud-panel intel-card" style={armyStyle(army.color)}>
      <header className="intel-head">
        <span className="intel-thumb">
          <SpriteSvg sprite={unitArt(ruleset, unit.type)} ramp={army.ramp} size={36} />
        </span>
        <div className="intel-title">
          <h2>{def.name}</h2>
          <span className="intel-owner">{army.name}</span>
        </div>
        <span className="intel-badges">
          {unit.dived && <Icon name="dive" label="Dived" />}
          {done && <Icon name="done" label="Has acted this turn" />}
        </span>
      </header>
      <dl className="intel-stats">
        <Stat icon="hp" label="HP" low={pips <= maxPips(ruleset) * LOW_FRACTION}>
          {pips}
        </Stat>
        <Stat
          icon="fuel"
          label="Fuel"
          title={dailyFuel > 0 ? `Fuel, uses ${dailyFuel} a day` : 'Fuel'}
          low={unit.fuel <= def.maxFuel * LOW_FRACTION}
        >
          {unit.fuel}
          <span className="of">/{def.maxFuel}</span>
        </Stat>
        {def.maxAmmo > 0 && (
          <Stat icon="ammo" label="Ammo" low={unit.ammo <= def.maxAmmo * LOW_FRACTION}>
            {unit.ammo}
            <span className="of">/{def.maxAmmo}</span>
          </Stat>
        )}
        <Stat icon="move" label="Move">
          <Modified
            value={String(move)}
            base={String(def.movePoints)}
            raised={move > def.movePoints}
          />
        </Stat>
        {def.maxRange > 0 && (
          <Stat icon="range" label="Range">
            <Modified
              value={range(maxRange)}
              base={range(def.maxRange)}
              raised={maxRange > def.maxRange}
            />
          </Stat>
        )}
      </dl>
      {(cargo.length > 0 || def.ignoresTerrainDefence) && (
        <div className="intel-notes">
          {cargo.length > 0 && (
            <span className="intel-cargo" title="Carrying">
              <Icon name="load" label="Carrying" />
              {cargo.map((carried) => (
                <SpriteSvg
                  key={carried.id}
                  sprite={unitArt(ruleset, carried.type)}
                  ramp={army.ramp}
                  size={22}
                  label={ruleset.units[carried.type]!.name}
                />
              ))}
            </span>
          )}
          {def.ignoresTerrainDefence && <span className="intel-chip">No cover</span>}
        </div>
      )}
    </section>
  );
}

function TileCard({ state, tile }: { state: GameState; tile: TileIndex }) {
  const type = state.terrain[tile]!;
  const terrain = ruleset.terrain[type]!;
  const owner = state.owner[tile]!;
  const army = owner === NO_OWNER ? undefined : armiesOf(ruleset, state)[owner];
  const ramp = army?.ramp ?? TEAM_RAMPS[NEUTRAL_VARIANT]!;
  const capture = state.capture[tile]!;
  const capturePoints = ruleset.rules.capturePoints;
  const stars = Math.max(MAX_STARS, terrain.defence);
  return (
    <section
      className="hud-panel intel-card"
      style={army === undefined ? undefined : armyStyle(army.color)}
    >
      <header className="intel-head">
        <span className="intel-thumb">
          <SpriteSvg sprite={terrainArt(ruleset, type)} ramp={ramp} size={36} />
        </span>
        <div className="intel-title">
          <h2>{terrain.name}</h2>
          {terrain.isProperty && <span className="intel-owner">{army?.name ?? 'Neutral'}</span>}
        </div>
      </header>
      <div
        className="intel-stars"
        role="img"
        aria-label={`Defence: ${terrain.defence} of ${stars} stars`}
        title="Defence"
      >
        {Array.from({ length: stars }, (_unused, i) => (
          <Icon key={i} name={i < terrain.defence ? 'star' : 'starEmpty'} />
        ))}
      </div>
      {terrain.isProperty && (
        <div className="intel-capture" title={`Capture: ${capture} of ${capturePoints} left`}>
          <Icon name="capture" ramp={ramp} label="Capture" />
          <span className="capture-track">
            <span
              className="capture-fill"
              style={{ width: `${(capture * 100) / capturePoints}%` }}
            />
          </span>
          <strong>{capture}</strong>
        </div>
      )}
    </section>
  );
}

/**
 * The unit and terrain under the cursor, in a panel docked in a bottom corner
 * of the board. It moves to the other corner when the cursor goes under it.
 */
export function IntelPanel() {
  const ref = useRef<HTMLElement>(null);
  const [side, setSide] = useState<Side>('right');
  const state = useGameState();
  const cursor = useUiStore((ui) => ui.cursor);
  const mode = useUiStore((ui) => ui.mode);
  const selectedUnit = useUiStore((ui) => ui.selectedUnit);
  const path = useUiStore((ui) => ui.path);
  const camera = useUiStore((ui) => ui.camera);
  const viewport = useUiStore((ui) => ui.viewport);
  const onMap = cursor !== NO_TILE && cursor < state.terrain.length;
  const unit = onMap ? shownUnit(state, { mode, cursor, selectedUnit, path }) : NO_UNIT;

  // Measured before paint, since the panel's size depends on what it shows.
  useLayoutEffect(() => {
    const panel = ref.current;
    if (panel === null || !onMap) return;
    const next = intelSide(
      side,
      tileBox(cursor, state.width, camera, viewport),
      { width: panel.offsetWidth, height: panel.offsetHeight },
      { width: viewport.width / viewport.dpr, height: viewport.height / viewport.dpr },
      MARGIN,
    );
    if (next !== side) setSide(next);
  }, [onMap, side, cursor, state, unit, camera, viewport]);

  if (!onMap) return null;
  return (
    <aside ref={ref} className={`hud-intel ${side}`} aria-label="Under the cursor">
      {unit !== NO_UNIT && <UnitCard state={state} id={unit} />}
      <TileCard state={state} tile={cursor} />
    </aside>
  );
}
