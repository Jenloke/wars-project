import { factions, readSave } from '@tactics/content';
import type { RestoredGame } from '@tactics/engine';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { closeGameDialog } from '../input/interaction';
import { downloadSave, readSaveFile } from '../saves/saveFiles';
import { SLOT_IDS, SLOT_LABELS, type SlotId, type SlotSummary } from '../saves/saveStore';
import { ruleset, saveStore, savesPersist, session, startNewGame } from '../session/game';

interface Status {
  readonly tone: 'info' | 'error';
  readonly text: string;
}

const savedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function playerName(index: number): string {
  return factions[index]?.name ?? `Player ${index + 1}`;
}

function describeProgress(summary: SlotSummary): string {
  const progress =
    summary.winner === null
      ? `${playerName(summary.activePlayer)} to move`
      : `${playerName(summary.winner)} won`;
  return `${summary.mapName} · Day ${summary.day} · ${progress}`;
}

function formatSavedAt(savedAt: string): string {
  const time = Date.parse(savedAt);
  return Number.isNaN(time) ? 'Unknown time' : savedAtFormat.format(time);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Asks before discarding a game that has moves in it. */
function confirmReplace(): boolean {
  return (
    session.actionCount === 0 ||
    window.confirm('Replace the current game? Moves not saved to a slot or file will be lost.')
  );
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Save slots, file export and import, and new game. A native modal `<dialog>`, so
 * the browser traps focus, closes it on Escape and makes the map inert behind it.
 */
export function GameDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<readonly SlotSummary[]>(() => saveStore.list());
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const refresh = () => setSlots(saveStore.list());
  const report = (tone: Status['tone'], text: string) => setStatus({ tone, text });

  const replaceGame = (game: RestoredGame) => {
    if (!confirmReplace()) return;
    session.load(game);
    close();
  };

  const saveTo = (slot: SlotId) => {
    const occupied = slots.some((summary) => summary.slot === slot);
    if (occupied && !window.confirm(`Overwrite ${SLOT_LABELS[slot]}?`)) return;
    try {
      saveStore.write(slot, session.toSave(now()));
      refresh();
      report('info', `Saved to ${SLOT_LABELS[slot]}.`);
    } catch (error) {
      report('error', errorMessage(error));
    }
  };

  const loadFrom = (slot: SlotId) => {
    const text = saveStore.read(slot);
    if (text === null) {
      refresh();
      report('error', `${SLOT_LABELS[slot]} is empty.`);
      return;
    }
    let game: RestoredGame;
    try {
      game = readSave(text, ruleset);
    } catch (error) {
      report('error', `${SLOT_LABELS[slot]} could not be loaded. ${errorMessage(error)}`);
      return;
    }
    replaceGame(game);
  };

  const remove = (slot: SlotId) => {
    if (!window.confirm(`Delete ${SLOT_LABELS[slot]}? This cannot be undone.`)) return;
    saveStore.remove(slot);
    refresh();
    report('info', `Deleted ${SLOT_LABELS[slot]}.`);
  };

  const exportFile = () => {
    try {
      report('info', `Exported ${downloadSave(session.toSave(now()))}.`);
    } catch (error) {
      report('error', errorMessage(error));
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still fires a change
    if (file === undefined) return;
    let game: RestoredGame;
    try {
      game = readSave(await readSaveFile(file), ruleset);
    } catch (error) {
      report('error', `"${file.name}" could not be loaded. ${errorMessage(error)}`);
      return;
    }
    replaceGame(game);
  };

  const newGame = () => {
    if (!confirmReplace()) return;
    startNewGame();
    close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog"
      aria-labelledby="game-dialog-title"
      onClose={closeGameDialog}
    >
      <header className="dialog-header">
        <h2 id="game-dialog-title">Save and load</h2>
        <button type="button" className="icon-button" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      {!savesPersist && (
        <p className="dialog-notice">
          This browser is blocking storage, so slots last only until the page closes. Export to a
          file to keep a game.
        </p>
      )}

      <ul className="slot-list">
        {SLOT_IDS.map((slot) => {
          const summary = slots.find((candidate) => candidate.slot === slot);
          const label = SLOT_LABELS[slot];
          return (
            <li key={slot} className="slot">
              <div className="slot-info">
                <span className="slot-name">{label}</span>
                {summary === undefined ? (
                  <span className="muted">Empty</span>
                ) : (
                  <>
                    <span>{describeProgress(summary)}</span>
                    <span className="muted slot-time">{formatSavedAt(summary.savedAt)}</span>
                  </>
                )}
              </div>
              <div className="slot-actions">
                {slot !== 'auto' && (
                  <button
                    type="button"
                    onClick={() => saveTo(slot)}
                    aria-label={`Save to ${label}`}
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadFrom(slot)}
                  disabled={summary === undefined}
                  aria-label={`Load ${label}`}
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => remove(slot)}
                  disabled={summary === undefined}
                  aria-label={`Delete ${label}`}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="dialog-status" role="status" data-tone={status?.tone}>
        {status?.text}
      </p>

      <footer className="dialog-footer">
        <button type="button" onClick={exportFile}>
          Export to file
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => void importFile(event)}
        />
        <button type="button" className="primary" onClick={newGame}>
          New game
        </button>
      </footer>
    </dialog>
  );
}
