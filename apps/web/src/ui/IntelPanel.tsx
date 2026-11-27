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
import { NEUTRAL_VARIANT, TEAM_RAMPS, type TeamRamp } from '@tactics/sprites';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { armyStyle } from './armyStyle';
import { useGameState } from './hooks';
import { intelSide, tileBox, type Side } from './hudLayout';
import type { IconName } from './icons';
import { coverOf, fullHpCover, levelOf, shownUnit } from './intel';
import { terrainArt, unitArt } from './spriteArt';
import { Icon, SpriteSvg } from './SpriteSvg';

/** Defence is shown out of this many stars, or more for terrain that gives more. */
const MAX_STARS = 4;
/** Distance from the panel to the board's edges, in CSS pixels. */
const MARGIN = 8;
/** A gauge with at most this many units is drawn as separate segments. */
const MAX_SEGMENTS = 10;

interface GaugeProps {
  /** Which stat, for its colour: `hp` shades by level, the others have their own. */
  readonly kind: 'hp' | 'fuel' | 'ammo' | 'capture';
  readonly icon: IconName;
  /** Team colours for the icon, if it has team-coloured parts. */
  readonly ramp?: TeamRamp | undefined;
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** Units at the top of the gauge that will be used up by the next turn, shown faded. */
  readonly spend?: number | undefined;
  readonly title: string;
  readonly children: ReactNode;
}

/** A stat as an icon, a gauge filled to its level, and its value. */
function Gauge({ kind, icon, ramp, label, value, max, spend = 0, title, children }: GaugeProps) {
  const level = levelOf(value, max);
  const segmented = max <= MAX_SEGMENTS;
  const used = Math.min(spend, value);
  return (
    <div className={`gauge-row ${kind} ${level}`} title={title}>
      <Icon name={icon} ramp={ramp} />
      <span
        className={segmented ? 'gauge segmented' : 'gauge'}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        {segmented ? (
          Array.from({ length: max }, (_unused, i) => (
            <span
              key={i}
              className={i >= value ? 'seg' : i >= value - used ? 'seg on spend' : 'seg on'}
            />
          ))
        ) : (
          <>
            <span className="gauge-fill" style={{ width: `${(value * 100) / max}%` }} />
            {used > 0 && (
              <span
                className="gauge-spend"
                style={{
                  left: `${((value - used) * 100) / max}%`,
                  width: `${(used * 100) / max}%`,
                }}
              />
            )}
          </>
        )}
      </span>
      <span className="gauge-value">{children}</span>
    </div>
  );
}

/** Defence stars as icons, filled up to `stars`, with what they are worth. */
function DefenceRow({ stars, percent, title }: { stars: number; percent: number; title: string }) {
  const shown = Math.max(MAX_STARS, stars);
  return (
    <div className="gauge-row defence" title={title}>
      <Icon name="defence" />
      <span className="stars" role="img" aria-label={`Defence: ${stars} of ${shown} stars`}>
        {Array.from({ length: shown }, (_unused, i) => (
          <Icon key={i} name={i < stars ? 'star' : 'starEmpty'} />
        ))}
      </span>
      <span className="gauge-value">{percent > 0 ? `−${percent}%` : '0%'}</span>
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

function UnitCard({ state, id, tile }: { state: GameState; id: UnitId; tile: TileIndex }) {
  const unit = state.units[id]!;
  const def = ruleset.units[unit.type]!;
  const army = armiesOf(ruleset, state)[unit.owner]!;
  const pips = hpPips(ruleset, unit.hp);
  const fullPips = maxPips(ruleset);
  const dailyFuel = unit.dived ? def.divedFuelPerDay : def.fuelPerDay;
  const move = movePointsOf(ruleset, state, unit.owner, unit.type);
  const maxRange = maxRangeOf(ruleset, state, unit.owner, unit.type);
  const range = (max: number) => (def.minRange === max ? `${max}` : `${def.minRange}–${max}`);
  const done = unit.moved && unit.owner === state.activePlayer;
  const cargo = unit.cargo.map((cargoId) => state.units[cargoId]!);
  const cover = coverOf(ruleset, state, unit, tile);
  return (
    <section className="hud-panel intel-card unit-card" style={armyStyle(army.color)}>
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
      <div className="gauges">
        <Gauge
          kind="hp"
          icon="hp"
          label="HP"
          value={pips}
          max={fullPips}
          title={`HP: ${pips} of ${fullPips}`}
        >
          {pips}
          <span className="of">/{fullPips}</span>
        </Gauge>
        <Gauge
          kind="fuel"
          icon="fuel"
          label="Fuel"
          value={unit.fuel}
          max={def.maxFuel}
          spend={dailyFuel}
          title={
            dailyFuel > 0
              ? `Fuel: ${unit.fuel} of ${def.maxFuel}, uses ${dailyFuel} a day${unit.dived ? ' while dived' : ''}`
              : `Fuel: ${unit.fuel} of ${def.maxFuel}`
          }
        >
          {unit.fuel}
          <span className="of">/{def.maxFuel}</span>
        </Gauge>
        {def.maxAmmo > 0 && (
          <Gauge
            kind="ammo"
            icon="ammo"
            label="Ammo"
            value={unit.ammo}
            max={def.maxAmmo}
            title={`Ammo: ${unit.ammo} of ${def.maxAmmo}`}
          >
            {unit.ammo}
            <span className="of">/{def.maxAmmo}</span>
          </Gauge>
        )}
        {def.ignoresTerrainDefence ? (
          <div className="gauge-row defence" title="Aircraft take no cover from terrain">
            <Icon name="defence" />
            <span className="no-cover">No terrain cover</span>
            <span className="gauge-value">0%</span>
          </div>
        ) : (
          <DefenceRow
            stars={cover.stars}
            percent={cover.percent}
            title={`Cover here: ${cover.stars} stars at ${pips} HP, ${cover.percent}% less damage`}
          />
        )}
      </div>
      <div className="intel-notes">
        <span className="intel-chip" title="Move">
          <Icon name="move" label="Move" />
          <Modified
            value={String(move)}
            base={String(def.movePoints)}
            raised={move > def.movePoints}
          />
        </span>
        {def.maxRange > 0 && (
          <span className="intel-chip" title="Range">
            <Icon name="range" label="Range" />
            <Modified
              value={range(maxRange)}
              base={range(def.maxRange)}
              raised={maxRange > def.maxRange}
            />
          </span>
        )}
        {cargo.length > 0 && (
          <span className="intel-chip intel-cargo" title="Carrying">
            <Icon name="load" label="Carrying" />
            {cargo.map((carried) => (
              <SpriteSvg
                key={carried.id}
                sprite={unitArt(ruleset, carried.type)}
                ramp={army.ramp}
                label={ruleset.units[carried.type]!.name}
              />
            ))}
          </span>
        )}
      </div>
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
  const fullCover = fullHpCover(ruleset, terrain.defence);
  return (
    <section
      className="hud-panel intel-card tile-card"
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
      <div className="gauges">
        <DefenceRow
          stars={terrain.defence}
          percent={fullCover}
          title={`Defence: ${terrain.defence} stars, ${fullCover}% less damage to a unit at full HP`}
        />
        {terrain.isProperty && (
          <Gauge
            kind="capture"
            icon="capture"
            ramp={ramp}
            label="Capture"
            value={capture}
            max={capturePoints}
            title={`Capture: ${capture} of ${capturePoints} points left`}
          >
            {capture}
            <span className="of">/{capturePoints}</span>
          </Gauge>
        )}
      </div>
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
      {unit !== NO_UNIT && <UnitCard state={state} id={unit} tile={cursor} />}
      <TileCard state={state} tile={cursor} />
    </aside>
  );
}
