import { factions, maps } from '@tactics/content';
import type { ControllerKind } from '@tactics/engine';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { closeDialog } from '../input/interaction';
import { DEFAULT_SEATS, session, startNewGame } from '../session/game';
import { confirmReplace } from './confirmReplace';

/** Who can play a seat from this screen. Network play adds remote seats later. */
type Seat = Extract<ControllerKind, 'local' | 'ai'>;

const SEAT_LABELS: Readonly<Record<Seat, string>> = { local: 'Human', ai: 'Computer' };
const SEAT_KINDS: readonly Seat[] = ['local', 'ai'];

function playerName(index: number): string {
  return factions[index]?.name ?? `Player ${index + 1}`;
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

function describeSeats(seats: readonly Seat[]): string {
  const people = seats.filter((seat) => seat === 'local').length;
  if (people === 0) return 'The computer plays every side. Sit back and watch.';
  if (people === seats.length) return 'Everyone takes turns on this device.';
  if (people === 1) return 'You against the computer.';
  return `${people} people on this device against the computer.`;
}

/**
 * Sets up a new game: the map, and whether a person or the computer plays each
 * side. A native modal `<dialog>`, like the save dialog.
 */
export function NewGameDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const available = maps.list();
  const [mapId, setMapId] = useState(() =>
    available.some((map) => map.id === session.map.id) ? session.map.id : available[0]!.id,
  );
  const map = maps.get(mapId);
  const [seats, setSeats] = useState<Seat[]>(() => initialSeats(map.players.length));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  const chooseMap = (id: string) => {
    setMapId(id);
    setSeats(initialSeats(maps.get(id).players.length));
  };

  const chooseSeat = (index: number, seat: Seat) => {
    setSeats((current) => current.map((value, i) => (i === index ? seat : value)));
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmReplace()) return;
    startNewGame(seats, mapId);
    close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog"
      aria-labelledby="new-game-title"
      onClose={() => closeDialog('newGame')}
    >
      <header className="dialog-header">
        <h2 id="new-game-title">New game</h2>
        <button type="button" className="icon-button" onClick={close} aria-label="Close">
          ×
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
            <legend>Who plays each side</legend>
            {seats.map((seat, index) => {
              const name = playerName(index);
              const labelId = `seat-${index}-name`;
              return (
                <div key={index} className="seat">
                  <span className="faction" id={labelId}>
                    <span className="faction-dot" style={{ background: factions[index]?.color }} />
                    {name}
                    {index === 0 && <span className="muted">· moves first</span>}
                  </span>
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
                        <span>{SEAT_LABELS[kind]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </fieldset>

          <p className="dialog-status" role="status">
            {describeSeats(seats)}
          </p>
        </div>

        <footer className="dialog-footer">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Start
          </button>
        </footer>
      </form>
    </dialog>
  );
}
