import type { SaveData } from '@tactics/engine';

/** Save slots, in display order. `auto` is written by the autosaver. */
export const SLOT_IDS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  auto: 'Autosave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

/** What the save list shows about a slot, without loading the save. */
export interface SlotSummary {
  readonly slot: SlotId;
  readonly mapName: string;
  readonly day: number;
  readonly activePlayer: number;
  /** Winning player, or null while the game is in progress. */
  readonly winner: number | null;
  readonly actionCount: number;
  readonly savedAt: string;
}

/** The part of the Web Storage API the store uses, so tests can pass a fake. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A storage operation the browser refused. The message is written for players. */
export class SaveStoreError extends Error {
  override readonly name = 'SaveStoreError';
}

const KEY_PREFIX = 'tactics.saves.';
const INDEX_KEY = `${KEY_PREFIX}index`;

function slotKey(slot: SlotId): string {
  return `${KEY_PREFIX}${slot}`;
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Reads display fields from a save, or from any JSON that might be one, without
 * trusting its shape. Loading is what validates a save; the list only shows it.
 */
export function summarize(slot: SlotId, document: unknown): SlotSummary {
  const state = field(document, 'state');
  const status = field(state, 'status');
  const actions = field(document, 'actions');
  return {
    slot,
    mapName: stringOr(field(field(document, 'map'), 'name'), 'Unknown map'),
    day: numberOr(field(state, 'day'), 0),
    activePlayer: numberOr(field(state, 'activePlayer'), 0),
    winner: field(status, 'kind') === 'won' ? numberOr(field(status, 'winner'), 0) : null,
    actionCount: Array.isArray(actions) ? actions.length : 0,
    savedAt: stringOr(field(document, 'savedAt'), ''),
  };
}

/** Reads an index entry (a stored `SlotSummary`) without trusting its shape. */
function summaryFromIndex(slot: SlotId, entry: unknown): SlotSummary {
  const winner = field(entry, 'winner');
  return {
    slot,
    mapName: stringOr(field(entry, 'mapName'), 'Unknown map'),
    day: numberOr(field(entry, 'day'), 0),
    activePlayer: numberOr(field(entry, 'activePlayer'), 0),
    winner: typeof winner === 'number' ? winner : null,
    actionCount: numberOr(field(entry, 'actionCount'), 0),
    savedAt: stringOr(field(entry, 'savedAt'), ''),
  };
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Save slots in key-value storage. Each save is stored under its own key, and a
 * small index of summaries is kept beside them, so listing the slots reads one
 * short value instead of parsing every save.
 */
export class SaveStore {
  private readonly index = new Map<SlotId, SlotSummary>();

  constructor(private readonly storage: KeyValueStorage) {
    if (!this.loadIndex()) this.rebuildIndex();
  }

  /** Summaries of the occupied slots, in slot order. */
  list(): SlotSummary[] {
    const summaries: SlotSummary[] = [];
    for (const slot of SLOT_IDS) {
      const summary = this.index.get(slot);
      if (summary !== undefined) summaries.push(summary);
    }
    return summaries;
  }

  /** The saved text in a slot, or null if it is empty. */
  read(slot: SlotId): string | null {
    const text = this.storage.getItem(slotKey(slot));
    if (text === null && this.index.delete(slot)) this.writeIndex();
    return text;
  }

  write(slot: SlotId, save: SaveData): SlotSummary {
    // The save is stored before the index, so a failed write leaves both intact.
    this.setItem(slotKey(slot), JSON.stringify(save));
    const summary = summarize(slot, save);
    this.index.set(slot, summary);
    this.writeIndex();
    return summary;
  }

  remove(slot: SlotId): void {
    this.storage.removeItem(slotKey(slot));
    if (this.index.delete(slot)) this.writeIndex();
  }

  /** Reads the stored index. Returns false if it is missing or unreadable. */
  private loadIndex(): boolean {
    const text = this.storage.getItem(INDEX_KEY);
    if (text === null) return false;
    let entries: unknown;
    try {
      entries = JSON.parse(text);
    } catch {
      return false;
    }
    if (!Array.isArray(entries)) return false;
    for (const entry of entries) {
      const slot = field(entry, 'slot');
      if (isSlotId(slot)) this.index.set(slot, summaryFromIndex(slot, entry));
    }
    return true;
  }

  /** Recovers the index from the saves themselves, if it was lost or damaged. */
  private rebuildIndex(): void {
    for (const slot of SLOT_IDS) {
      const text = this.storage.getItem(slotKey(slot));
      if (text === null) continue;
      let document: unknown = null;
      try {
        document = JSON.parse(text);
      } catch {
        // Still listed, so the player can see it and delete it.
      }
      this.index.set(slot, summarize(slot, document));
    }
    if (this.index.size > 0) this.writeIndex();
  }

  private writeIndex(): void {
    // Each summary records the save it describes. Rebuilt on load if lost.
    this.setItem(INDEX_KEY, JSON.stringify(this.list()));
  }

  private setItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      throw new SaveStoreError(
        isQuotaError(error)
          ? 'Browser storage is full. Delete a save slot or export the game to a file.'
          : 'The browser refused to store the save.',
        { cause: error },
      );
    }
  }
}

/** Storage held in memory, for tests and for browsers that block local storage. */
export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/**
 * The browser's local storage, or null if it is unavailable (disabled, or
 * blocked in a private window), checked with a real write.
 */
export function openBrowserStorage(): KeyValueStorage | null {
  try {
    const storage = globalThis.localStorage;
    const probe = `${KEY_PREFIX}probe`;
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
