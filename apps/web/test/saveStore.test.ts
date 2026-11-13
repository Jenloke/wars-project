import { readSave, ruleset as rawRuleset, twinFords } from '@tactics/content';
import { compileRuleset, createSave, type SaveData } from '@tactics/engine';
import { describe, expect, it } from 'vitest';
import { newGameRecord } from '../src/session/gameSession';
import {
  MemoryStorage,
  SaveStore,
  SaveStoreError,
  summarize,
  type KeyValueStorage,
} from '../src/saves/saveStore';

const ruleset = compileRuleset(rawRuleset);
const SAVED_AT = '2026-11-12T09:30:00.000Z';

function newSave(seed = 1): SaveData {
  return createSave(ruleset, newGameRecord(ruleset, twinFords, seed), SAVED_AT);
}

/** Counts reads, so tests can check what listing costs. */
class CountingStorage extends MemoryStorage {
  reads: string[] = [];

  override getItem(key: string): string | null {
    this.reads.push(key);
    return super.getItem(key);
  }
}

describe('SaveStore', () => {
  it('writes, lists, reads and removes slots', () => {
    const store = new SaveStore(new MemoryStorage());
    expect(store.list()).toEqual([]);

    const summary = store.write('slot2', newSave());
    expect(summary).toEqual({
      slot: 'slot2',
      mapName: 'Twin Fords',
      day: 1,
      activePlayer: 0,
      winner: null,
      actionCount: 0,
      savedAt: SAVED_AT,
    });
    store.write('auto', newSave(2));
    expect(store.list().map((s) => s.slot)).toEqual(['auto', 'slot2']);

    const text = store.read('slot2');
    expect(text).not.toBeNull();
    expect(readSave(text!, ruleset).state).toEqual(newSave().state);

    store.remove('slot2');
    expect(store.read('slot2')).toBeNull();
    expect(store.list().map((s) => s.slot)).toEqual(['auto']);
  });

  it('keeps slots across store instances and lists them from the index alone', () => {
    const storage = new CountingStorage();
    const original = new SaveStore(storage);
    original.write('slot1', newSave());
    const won = newSave();
    original.write('slot3', {
      ...won,
      state: { ...won.state, status: { kind: 'won', winner: 1, reason: 'hq' } },
    });

    storage.reads = [];
    const reopened = new SaveStore(storage);
    expect(reopened.list()).toEqual(original.list());
    expect(reopened.list()[1]).toMatchObject({ mapName: 'Twin Fords', day: 1, winner: 1 });
    expect(storage.reads).toEqual(['tactics.saves.index']);
  });

  it('rebuilds a missing or damaged index from the saves', () => {
    const storage = new MemoryStorage();
    new SaveStore(storage).write('slot3', newSave());

    storage.setItem('tactics.saves.index', '{not json');
    expect(new SaveStore(storage).list()).toEqual([
      expect.objectContaining({ slot: 'slot3', mapName: 'Twin Fords' }),
    ]);

    storage.removeItem('tactics.saves.index');
    storage.setItem('tactics.saves.slot1', 'garbage');
    const rebuilt = new SaveStore(storage).list();
    expect(rebuilt.map((s) => [s.slot, s.mapName])).toEqual([
      ['slot1', 'Unknown map'],
      ['slot3', 'Twin Fords'],
    ]);
    expect(storage.getItem('tactics.saves.index')).not.toBeNull();
  });

  it('drops a slot from the list when its save has vanished', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    store.write('slot1', newSave());
    storage.removeItem('tactics.saves.slot1');
    expect(store.read('slot1')).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it('reports a full storage and leaves the previous save in place', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    store.write('slot1', newSave(1));
    const before = storage.getItem('tactics.saves.slot1');

    const full: KeyValueStorage = {
      getItem: (key) => storage.getItem(key),
      removeItem: (key) => storage.removeItem(key),
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    };
    const fullStore = new SaveStore(full);
    expect(() => fullStore.write('slot1', newSave(2))).toThrow(SaveStoreError);
    expect(() => fullStore.write('slot1', newSave(2))).toThrow(/storage is full/);
    expect(storage.getItem('tactics.saves.slot1')).toBe(before);
    expect(fullStore.list()).toEqual(store.list());
  });
});

describe('summarize', () => {
  it('describes finished games and tolerates junk', () => {
    const save = newSave();
    const won = { ...save, state: { ...save.state, status: { kind: 'won', winner: 1 } } };
    expect(summarize('auto', won)).toMatchObject({ winner: 1 });
    expect(summarize('auto', null)).toEqual({
      slot: 'auto',
      mapName: 'Unknown map',
      day: 0,
      activePlayer: 0,
      winner: null,
      actionCount: 0,
      savedAt: '',
    });
  });
});
