import { readSave, ruleset as rawRuleset, twinFords } from '@tactics/content';
import { compileRuleset, type ControllerKind, type GameState } from '@tactics/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiController } from '../src/session/aiController';
import { GameSession, newGameRecord, type ControllerFactory } from '../src/session/gameSession';
import { LocalController } from '../src/session/localController';

const ruleset = compileRuleset(rawRuleset);

/** Yields to the event loop, as waiting for the screen does in the app. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Computer seats that move without pausing, so tests run at full speed. */
const instant: ControllerFactory = (kind) =>
  kind === 'ai' ? new AiController({ delayMs: 0, ready: nextTask }) : new LocalController();

function startSession(seats: readonly ControllerKind[], seed = 5): GameSession {
  return new GameSession(ruleset, newGameRecord(ruleset, twinFords, seed, seats), instant);
}

/** Resolves with the first state that passes `test`, checking after every action. */
function waitFor(session: GameSession, test: (state: GameState) => boolean): Promise<GameState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = session.getState();
      if (!test(state)) return false;
      unsubscribe();
      resolve(state);
      return true;
    };
    const unsubscribe = session.subscribe(() => void check());
    check();
  });
}

const running: GameSession[] = [];
afterEach(() => {
  // Loading a new game stops the old loop, so a computer-only game cannot run on.
  for (const session of running.splice(0)) {
    session.load(newGameRecord(ruleset, twinFords, 1, ['local', 'local']));
  }
});

describe('GameSession with computer players', () => {
  it('records the seats of a new game, defaulting to local play', () => {
    expect(newGameRecord(ruleset, twinFords, 1, ['local', 'ai']).setup.players).toEqual([
      { controller: 'local' },
      { controller: 'ai' },
    ]);
    expect(newGameRecord(ruleset, twinFords, 1).setup.players).toEqual([
      { controller: 'local' },
      { controller: 'local' },
    ]);
  });

  it('plays the computer turn after the local player ends theirs', async () => {
    const session = startSession(['local', 'ai']);
    running.push(session);
    expect(session.isLocalTurn()).toBe(true);
    expect(session.submit({ type: 'EndTurn' })).toBe(true);

    const back = await waitFor(session, (state) => state.day === 2);
    expect(back.activePlayer).toBe(0);
    expect(session.isLocalTurn()).toBe(true);
    // The computer spent its opening funds on units at its bases.
    expect(Object.values(back.units).some((unit) => unit.owner === 1)).toBe(true);
  });

  it('ignores input from this device during the computer turn', async () => {
    const session = startSession(['ai', 'local']);
    running.push(session);
    expect(session.isLocalTurn()).toBe(false);
    expect(session.submit({ type: 'EndTurn' })).toBe(false);
    await waitFor(session, (state) => state.activePlayer === 1);
    expect(session.isLocalTurn()).toBe(true);
  });

  it('logs computer moves like any others, so the game saves and replays exactly', async () => {
    const session = startSession(['ai', 'ai']);
    running.push(session);
    await waitFor(session, (state) => state.day > 6 || state.status.kind !== 'playing');

    const save = session.toSave('2026-11-24T00:00:00.000Z');
    expect(save.actions.length).toBeGreaterThan(20);
    expect(save.setup.players).toEqual([{ controller: 'ai' }, { controller: 'ai' }]);
    const restored = readSave(JSON.stringify(save), ruleset);
    expect(restored.state).toEqual(save.state);
  });

  it('resumes the computer seat when a saved game is loaded on its turn', async () => {
    const first = startSession(['local', 'ai']);
    running.push(first);
    first.submit({ type: 'EndTurn' });
    await waitFor(first, (state) => state.activePlayer === 1);
    const saved = first.toSave('2026-11-24T00:00:00.000Z');

    const second = new GameSession(ruleset, readSave(JSON.stringify(saved), ruleset), instant);
    running.push(second);
    const back = await waitFor(second, (state) => state.day === 2);
    expect(back.activePlayer).toBe(0);
  });
});

describe('AiController', () => {
  it('waits until the board is ready before moving', async () => {
    let release = () => {};
    const ready = new Promise<void>((resolve) => (release = resolve));
    const controller = new AiController({ delayMs: 0, ready: () => ready });
    const game = newGameRecord(ruleset, twinFords, 1, ['ai', 'local']);

    let answered = false;
    const pending = controller.requestAction(game.state, ruleset).then((action) => {
      answered = true;
      return action;
    });
    await Promise.resolve();
    expect(answered).toBe(false);
    release();
    expect((await pending).type).toBe('Build');
  });

  it('ends the turn after a refused move instead of retrying it forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = new AiController({ delayMs: 0 });
    const game = newGameRecord(ruleset, twinFords, 1, ['ai', 'local']);
    controller.onRejected('test');
    expect(await controller.requestAction(game.state, ruleset)).toEqual({ type: 'EndTurn' });
    expect((await controller.requestAction(game.state, ruleset)).type).toBe('Build');
    vi.restoreAllMocks();
  });
});
