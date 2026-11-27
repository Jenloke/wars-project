import { commanderProfile, maps } from '@tactics/content';
import type { ControllerKind } from '@tactics/engine';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { closeDialog } from '../input/interaction';
import { armiesFor, portraitOf } from '../session/armies';
import {
  COMMANDER_CHOICES,
  DEFAULT_SEATS,
  defaultCommanders,
  ruleset,
  session,
  startNewGame,
} from '../session/game';
import { armyStyle } from './armyStyle';
import { CommanderDetails, summaryOf } from './CommanderDetails';
import { confirmReplace } from './confirmReplace';
import type { IconName } from './icons';
import { Portrait } from './Portrait';
import { Icon } from './SpriteSvg';

/** Who can play a seat from this screen. Network play adds remote seats later. */
type Seat = Extract<ControllerKind, 'local' | 'ai'>;

const SEAT_LABELS: Readonly<Record<Seat, string>> = { local: 'Human', ai: 'Computer' };
const SEAT_ICONS: Readonly<Record<Seat, IconName>> = { local: 'human', ai: 'computer' };
const SEAT_KINDS: readonly Seat[] = ['local', 'ai'];

/** The default commander may lead any number of sides; the others one each. */
const SHAREABLE = ruleset.commanders[0]!.id;

function commanderIndex(id: string): number {
  return ruleset.commanders.findIndex((commander) => commander.id === id);
}

/** Seats for a map: the current game's choices when they fit, else you against the computer. */
function initialSeats(playerCount: number): Seat[] {
  const current = session.setup.players.map((player) => player.controller);
  const previous = current.length === playerCount ? current : DEFAULT_SEATS;
  return Array.from({ length: playerCount }, (_unused, i) => {
    const kind = previous[i] ?? (i === 0 ? 'local' : 'ai');
    return kind === 'ai' ? 'ai' : 'local';
  });
}

/** Commanders for a map: the current game's when they fit, else a different one per side. */
function initialCommanders(playerCount: number): string[] {
  const current = session.setup.players.map((player) => player.commander ?? SHAREABLE);
  const fits =
    current.length === playerCount &&
    current.every(
      (id, i) => COMMANDER_CHOICES.includes(id) && (id === SHAREABLE || current.indexOf(id) === i),
    );
  return fits ? current : defaultCommanders(playerCount);
}

function describeSeats(seats: readonly Seat[]): string {
  const people = seats.filter((seat) => seat === 'local').length;
  if (people === 0) return 'The computer plays every side. Sit back and watch.';
  if (people === seats.length) return 'Everyone takes turns on this device.';
  if (people === 1) return 'You against the computer.';
  return `${people} people on this device against the computer.`;
}

/**
 * Sets up a new game: the map, who plays each side, and the commander leading
 * it. A side's army and colours follow its commander. A native modal
 * `<dialog>`, like the save dialog.
 */
export function NewGameDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const available = maps.list();
  const [mapId, setMapId] = useState(() =>
    available.some((map) => map.id === session.map.id) ? session.map.id : available[0]!.id,
  );
  const map = maps.get(mapId);
  const [seats, setSeats] = useState<Seat[]>(() => initialSeats(map.players.length));
  const [commanders, setCommanders] = useState<string[]>(() =>
    initialCommanders(map.players.length),
  );
  const [editing, setEditing] = useState(0);
  const armies = armiesFor(ruleset, commanders.map(commanderIndex));
  const editingArmy = armies[editing]!;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  const chooseMap = (id: string) => {
    const count = maps.get(id).players.length;
    setMapId(id);
    setSeats(initialSeats(count));
    setCommanders(initialCommanders(count));
    setEditing(0);
  };

  const chooseSeat = (index: number, seat: Seat) => {
    setSeats((current) => current.map((value, i) => (i === index ? seat : value)));
  };

  const chooseCommander = (id: string) => {
    setCommanders((current) => current.map((value, i) => (i === editing ? id : value)));
  };

  /** Colours the side being edited would play in under commander `id`. */
  const rampIfChosen = (id: string) => {
    const trial = commanders.map((value, i) => commanderIndex(i === editing ? id : value));
    return armiesFor(ruleset, trial)[editing]!.ramp;
  };

  /** The side already led by `id`, other than the one being edited, or -1. */
  const takenBy = (id: string) =>
    id === SHAREABLE ? -1 : commanders.findIndex((value, i) => i !== editing && value === id);

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmReplace()) return;
    startNewGame(seats, mapId, commanders);
    close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog new-game-dialog"
      aria-labelledby="new-game-title"
      onClose={() => closeDialog('newGame')}
    >
      <header className="dialog-header">
        <h2 id="new-game-title">New game</h2>
        <button type="button" className="icon-button" onClick={close} aria-label="Close">
          <Icon name="close" mono />
        </button>
      </header>

      <form onSubmit={start}>
        <div className="dialog-body">
          <label className="field">
            <span>Map</span>
            <select value={mapId} onChange={(event) => chooseMap(event.currentTarget.value)}>
              {available.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.width}×{option.height} · {option.players.length} players
                </option>
              ))}
            </select>
          </label>

          <fieldset className="seats">
            <legend>Sides</legend>
            {seats.map((seat, index) => {
              const army = armies[index]!;
              const labelId = `seat-${index}-name`;
              return (
                <div
                  key={index}
                  className={index === editing ? 'seat editing' : 'seat'}
                  style={{ borderColor: index === editing ? army.color : undefined }}
                >
                  <button
                    type="button"
                    className="seat-commander"
                    aria-pressed={index === editing}
                    onClick={() => setEditing(index)}
                  >
                    <Portrait sprite={army.portrait} ramp={army.ramp} size={40} />
                    <span className="seat-names" id={labelId}>
                      <strong className="army-ink" style={armyStyle(army.color)}>
                        {army.name}
                      </strong>
                      <span className="muted">
                        {army.commanderName}
                        {index === 0 && ' · moves first'}
                      </span>
                    </span>
                  </button>
                  <div className="segmented" role="radiogroup" aria-labelledby={labelId}>
                    {SEAT_KINDS.map((kind) => (
                      <label key={kind} className="segment">
                        <input
                          type="radio"
                          name={`seat-${index}`}
                          value={kind}
                          checked={seat === kind}
                          onChange={() => chooseSeat(index, kind)}
                        />
                        <span>
                          <Icon name={SEAT_ICONS[kind]} mono />
                          {SEAT_LABELS[kind]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </fieldset>

          <section className="roster" aria-labelledby="roster-title">
            <h3 id="roster-title" className="roster-title">
              Commander for{' '}
              <span className="army-ink" style={armyStyle(editingArmy.color)}>
                {editingArmy.name}
              </span>
            </h3>
            <div className="roster-grid" role="radiogroup" aria-labelledby="roster-title">
              {COMMANDER_CHOICES.map((id) => {
                const taken = takenBy(id);
                const chosen = commanders[editing] === id;
                const ramp = commanderProfile(id).colors ?? rampIfChosen(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    className="roster-choice"
                    style={chosen ? { borderColor: ramp[1] } : undefined}
                    disabled={taken >= 0}
                    title={taken >= 0 ? `Leading ${armies[taken]!.name}` : undefined}
                    onClick={() => chooseCommander(id)}
                  >
                    <Portrait sprite={portraitOf(id)} ramp={ramp} size={56} />
                    <span className="roster-name">{summaryOf(id).name}</span>
                    {taken >= 0 && <span className="badge">Side {taken + 1}</span>}
                  </button>
                );
              })}
            </div>
            <CommanderDetails
              commander={commanders[editing]!}
              army={editingArmy.name}
              color={editingArmy.color}
            />
          </section>

          <p className="dialog-status" role="status">
            {describeSeats(seats)}
          </p>
        </div>

        <footer className="dialog-footer">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary with-icon">
            <Icon name="newGame" mono />
            Start
          </button>
        </footer>
      </form>
    </dialog>
  );
}
