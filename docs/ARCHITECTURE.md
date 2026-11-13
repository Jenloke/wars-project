# Architecture

Status: **Phase 1 approved; Phase 2 (save/load) implemented, awaiting approval.** Sections
below describe the code as built.
Commit conventions are in [COMMITS.md](COMMITS.md).

Run it: `pnpm install`, then `pnpm dev` (builds the sprite atlas and starts Vite).
Checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## 0. Deviations from SPEC.md

| Spec item                                     | Change                                                    | Reason                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First map "Spann Island", transcribed exactly | Replaced by an original map, **Twin Fords** (section 5.3) | Spann Island is a level from the commercial game. The ASCII format, converter, legend, and property-check test are all kept; only the layout is original. |
| "the damage table"                            | Original base-damage numbers, tuned for this game         | The formula shape is a genre mechanic; the commercial game's exact matrix is not copied.                                                                  |

Everything else in the spec stands. Unit names are generic military roles; faction
names, commander names, art, and audio are original.

## 1. Folder layout

```
pnpm-workspace.yaml
package.json                 # scripts: dev, build, test, lint, typecheck
tsconfig.base.json           # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
packages/
  engine/                    # pure TS. No React/DOM/canvas. No dependency on content.
    src/
      types.ts               # GameState, Action, Unit, ids
      ruleset.ts             # RawRuleset (plain data) -> CompiledRuleset (typed arrays)
      rng.ts                 # mulberry32, state = one uint32
      grid.ts                # index math, neighbour offsets
      pathfinding.ts         # reachable set + path reconstruction
      combat.ts              # damage formula, preview, counterattack
      actions/               # one file per action family: validate + apply
      draft.ts               # copy-on-write working state
      rules.ts               # predicates shared by the reducer and option listing
      options.ts             # what a unit or base can do (menus, later the AI)
      applyAction.ts         # reducer entry point
      hash.ts                # FNV-1a state hash (desync detection)
      controller.ts          # PlayerController interface
      save/                  # save format, replay verification, migrations
    test/
  content/                   # data + zod schemas. Depends on engine types only.
    src/
      schemas.ts
      ruleset.ts             # assembles and validates the RawRuleset
      units.ts  terrain.ts  moveTypes.ts  damage.ts  commanders.ts  factions.ts
      maps/ascii.ts          # ASCII -> MapJson converter + legend
      maps/twinFords.ts
      maps/registry.ts
      saves.ts               # save file schema + readSave (parse, migrate, verify)
      index.ts               # public API: ruleset, map registry, readSave
    test/
  sprites/
    src/svg/{terrain,building,unit,ui}/*.svg
    src/palette.ts           # shared palette + team placeholder -> faction ramps
    scripts/buildAtlas.ts    # SVG -> recolour x4 -> pack -> PNG + JSON at 1x, 2x
    src/registry.ts          # spriteId -> frame lookup
    dist/atlas@1x.png  atlas@2x.png  atlas.json
apps/
  web/
    src/
      render/                # camera, terrain layer cache, autotile, unit layer, overlays, tweens
      input/                 # pointer + keyboard -> UI intents
      store/                 # zustand: UI state only
      session/               # GameSession: game record + action loop + controllers
      saves/                 # local storage slots, autosave, file export/import
      ui/                    # React DOM: menus, panels, HUD
      App.tsx  main.tsx
```

Dependency direction: `web -> sprites, content, engine`; `content -> engine (types)`;
`engine -> nothing`. Enforced with ESLint `no-restricted-imports`.

## 2. Coding standards

- Strict TypeScript everywhere; no `any` in the engine (`@typescript-eslint/no-explicit-any: error`).
- Engine functions are pure and never mutate their inputs. State is `Readonly` in types.
- Named exports only; one concept per file; no barrel re-exports inside a package.
- Discriminated unions for actions and results; exhaustive `switch` with `never` checks.
- No magic numbers in engine code: every tunable is read from the ruleset.
- ESLint + Prettier; Vitest for tests; tests sit in `test/` beside each package.

## 3. State shape

All state is plain JSON (rule 2). Hot-path lookups use flat arrays indexed by
`i = y * width + x`, never nested arrays or string-keyed coordinate maps.

```ts
type UnitId = number; // monotonically increasing, never reused
type PlayerIndex = number; // 0..3
type TileIndex = number; // y * width + x

interface GameState {
  schemaVersion: number;
  rulesetId: string; // which content build this game was created with
  mapId: string;
  width: number;
  height: number;
  terrain: number[]; // per tile: terrain index into ruleset.terrain
  owner: number[]; // per tile: PlayerIndex, or -1 (neutral / not a property)
  capture: number[]; // per tile: remaining capture points (properties only)
  occupant: number[]; // per tile: UnitId, or -1. O(1) "who is here"
  units: Record<UnitId, Unit>; // O(1) by id; JSON-safe
  nextUnitId: number;
  players: Player[];
  activePlayer: PlayerIndex;
  day: number;
  incomePerProperty: number; // from the map's rules
  rng: number; // uint32 seed; advanced on every draw
  status:
    { kind: 'playing' } | { kind: 'won'; winner: PlayerIndex; reason: 'hq' | 'rout' | 'resign' };
}

interface Unit {
  id: UnitId;
  type: number; // index into ruleset.units
  owner: PlayerIndex;
  pos: TileIndex; // -1 while loaded in a transport
  hp: number; // 1..100 internal; displayed as ceil(hp / 10)
  fuel: number;
  ammo: number;
  moved: boolean; // has acted this turn
  cargo: UnitId[]; // transports
  carrier: UnitId; // -1 if not loaded
}

interface Player {
  funds: number;
  commander: number; // index into ruleset.commanders (0 = no-op)
  power: number; // power meter
  controller: 'local' | 'ai' | 'remote';
  alive: boolean;
}
```

Design-for-later fields (fog, weather) are added by a save migration when built (see
section 6).

### 3.1 Ruleset: data in, typed arrays out

`packages/content` exports a zod-validated `RawRuleset` keyed by string IDs
(`"tank"`, `"forest"`). At game start the engine compiles it once into a
`CompiledRuleset` held **outside** game state:

| Table         | Structure                                                    | Lookup                    |
| ------------- | ------------------------------------------------------------ | ------------------------- |
| Move cost     | `Uint8Array[moveTypeCount * terrainCount]`, 255 = impassable | `cost[mt * T + terrain]`  |
| Base damage   | `Int16Array[unitCount * unitCount]`, -1 = cannot attack      | `dmg[atk * U + def]`      |
| Defence stars | `Uint8Array[terrainCount]`                                   | direct                    |
| Unit stats    | array of frozen records, index = unit type                   | direct                    |
| ID interning  | `Map<string, number>` each for units/terrain/moveTypes       | load/save boundaries only |

State stores numeric indices; string IDs appear only in content, maps, and saves'
`rulesetId`. Adding a unit or terrain is a content edit, with no engine change
(rule 4). All seven move types (`foot`, `mech`, `tread`, `tire`, `air`, `sea`,
`lander`) are rows in the cost table from day one (rule 5).

### 3.2 Immutable updates without waste

`applyAction` returns a new state using copy-on-write: only the arrays/records an
action touches are cloned (e.g. a `Move` clones `occupant` and the one `Unit`;
`terrain` is shared by reference for the whole game). No deep clones, no Immer.

## 4. Actions

```ts
type Action =
  | { type: 'Move'; unit: UnitId; path: TileIndex[] }
  | { type: 'Attack'; unit: UnitId; path: TileIndex[]; target: TileIndex }
  | { type: 'Capture'; unit: UnitId; path: TileIndex[] }
  | { type: 'Join'; unit: UnitId; path: TileIndex[] }
  | { type: 'Load'; unit: UnitId; path: TileIndex[] }
  | { type: 'Unload'; unit: UnitId; path: TileIndex[]; drops: { cargo: UnitId; to: TileIndex }[] }
  | { type: 'Supply'; unit: UnitId; path: TileIndex[] }
  | { type: 'Build'; at: TileIndex; unitType: number }
  | { type: 'EndTurn' }
  | { type: 'Resign' };
// Phase 4/5 additions: Dive, Surface, ActivatePower
```

- Move-then-act is one atomic action, so the log never holds a half-finished turn step.
- `applyAction(ruleset, state, action): Result` where
  `Result = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string }`.
  Every action is validated (ownership, path legality and cost, range, funds); an
  illegal action never changes state. This is what makes remote play host-authoritative.
- `events` (`UnitMoved`, `Damaged`, `Destroyed`, `Captured`, ...) are a by-product for
  the renderer's tweens. They are not part of state and not needed to replay.
- `EndTurn` runs the next player's start-of-turn: income, repair and resupply on owned
  properties, APC adjacent supply, day increment, `moved` reset.
- **Action log**: the session keeps a `GameRecord` of `{ map, setup, actions }`, where
  `setup` is `{ seed, players: [{ controller, commander? }] }`. `createGame(map, setup)`
  followed by replaying `actions` reproduces the state exactly. Saves (section 6),
  replay, undo (replay to n-1, with periodic snapshots), AI and network all use this one
  pipeline.

### 4.1 Combat

```
damage% = (base[atk][def] * atkMod / 100 + luck)        luck = rng 0..9
        * (attackerPips / 10)
        * (200 - defMod - defStars * defenderPips) / 100
```

`atkMod` and `defMod` are commander percentages (100 = unmodified). The whole
expression is evaluated in integer arithmetic so every platform agrees. Each unit
may have a primary weapon (uses ammo) and a secondary one (unlimited); the primary
is used whenever it has ammo and can hit the target.

Direct attackers take a counterattack computed on the defender's post-damage HP;
indirect units (min range > 1) cannot move and fire, and are never countered. The
damage preview calls the same function with luck fixed to 0 and to max, returning a
range. Luck is the only consumer of the RNG.

### 4.2 Movement

Reachability is Dijkstra over the flat grid with a **bucket queue** (edge costs are
small integers, so no heap is needed), bounded by `min(movePoints, fuel)`. Scratch
buffers (`Int16Array` cost-so-far, `Int32Array` came-from) are allocated once per map
size and reused, so a range query allocates nothing. Enemy units block; friendly
units can be passed through but not stopped on (except Join/Load). The result
`{ cost, cameFrom }` serves the range overlay, path preview, and action validation.

### 4.3 Commander hooks (rule 7)

```ts
interface CommanderDef {
  id: string;
  modifiers: Modifier[]; // data: { hook, filter, op, value }
}
type Hook = 'attack' | 'defence' | 'movement' | 'cost' | 'powerGain';
```

Hooks are data-described modifiers evaluated by the engine, not functions, so state
and content stay serializable. Commander 0 has an empty modifier list (no-op).

### 4.4 PlayerController (rule 6)

```ts
interface PlayerController {
  kind: 'local' | 'ai' | 'remote';
  requestAction(state: GameState, ruleset: CompiledRuleset): Promise<Action>;
}
```

`GameSession` (in `apps/web/session`) loops: ask the active player's controller for
an action, apply it, append to the log, publish the new state and events.

## 5. Maps

### 5.1 JSON schema (versioned, zod-validated)

```ts
interface MapJson {
  formatVersion: 1;
  id: string;
  name: string;
  author: string;
  width: number;
  height: number;
  tiles: string[]; // terrain IDs, row-major, length w*h
  properties: { x: number; y: number; owner: number | null }[];
  units: { x: number; y: number; type: string; owner: number; hp?: number }[];
  players: { slot: number; startingFunds: number }[];
  rules: { incomePerProperty: number };
}
```

Validation also checks: `tiles.length === width * height`, every property sits on a
property terrain, every player slot has exactly one HQ, no two units share a tile.
Nothing in engine, renderer, or UI assumes a map size.

### 5.2 ASCII import

`asciiToMap(text, legend, meta): MapJson`. The legend is data
(`char -> { terrain, owner? }`); rows must be equal length or the converter throws
with the row number.

| Char | Meaning  | Char | Meaning        |
| ---- | -------- | ---- | -------------- |
| `~`  | Sea      | `C`  | City, neutral  |
| `.`  | Plains   | `H`  | HQ, Player 1   |
| `=`  | Road     | `R`  | Base, Player 1 |
| `F`  | Forest   | `h`  | HQ, Player 2   |
| `M`  | Mountain | `b`  | Base, Player 2 |
| `B`  | Bridge   |      |                |

### 5.3 First map: Twin Fords (original)

16 x 10, origin top-left, 180-degree rotationally symmetric so neither side has a
positional edge.

```
     x: 0         1
        0123456789012345
  y=0   ~~~~~~~~~~~~~~~~
  y=1   ~HR.F.C~.M..C.~~
  y=2   ~R==.==B==F.=C.~
  y=3   ~.C=FM.~.=.M=..~
  y=4   ~..===C~~===C.F~
  y=5   ~F.C===~~C===..~
  y=6   ~..=M.=.~.MF=C.~
  y=7   ~.C=.F==B==.==b~
  y=8   ~~.C..M.~C.F.bh~
  y=9   ~~~~~~~~~~~~~~~~
```

Property check (asserted by the converter test):

- Player 1 (top-left): HQ (1,1); bases (2,1), (1,2)
- Player 2 (bottom-right): HQ (14,8); bases (14,7), (13,8)
- Neutral cities (12): (6,1), (12,1), (13,2), (2,3), (6,4), (12,4), (3,5), (9,5),
  (13,6), (2,7), (3,8), (9,8)
- Totals: 18 properties, 58 sea, 36 plains, 32 road, 8 forest, 6 mountain, 2 bridge
- Bridges at (7,2) and (8,7), each spanning one sea tile and carrying an east-west road
- No predeployed units. Starting funds 0, 1000 per property per day, Player 1 first.

## 6. Saves

A save is the game's record, not only its state:

```ts
interface SaveData {
  format: 'tactics-save';
  version: number; // SAVE_VERSION; bumped, with a migration, on any shape change
  rulesetId: string; // a log only replays under the rules it was played with
  savedAt: string; // ISO time, supplied by the app (the engine has no clock)
  map: MapData; // embedded, so imported and edited maps load anywhere
  setup: GameSetup; // seed + per-seat controller and commander
  actions: Action[];
  state: GameState; // snapshot after the last action
}
```

- **Loading never trusts the snapshot.** `readSave` (content) parses the JSON, migrates
  it, and validates the envelope, the map and every action with zod. `restoreSave`
  (engine) then rebuilds the initial state from the map, replays the log, and requires
  the result to serialize identically to the snapshot. Every failure is a `SaveError`
  with a code (`malformed`, `unsupportedVersion`, `rulesetMismatch`, `corrupt`) and a
  message written for players.
- **Migrations** (`packages/engine/src/save/migrations.ts`) upgrade raw JSON one version
  at a time, keyed by the version they upgrade from. Format 1 is current, so the table
  is empty. Saves from a newer build are refused.
- **Rules changes**: a change that alters replay results bumps the ruleset `id` in
  `packages/content/src/ruleset.ts`. Older saves are then refused with
  `rulesetMismatch` instead of replaying into a different game.
- **Browser slots** (`apps/web/src/saves`): `auto` plus three manual slots in local
  storage, one key each (`tactics.saves.<slot>`), and an index of summaries
  (`tactics.saves.index`) so listing reads one short value instead of parsing every
  save. A lost index is rebuilt from the saves. A refused write (storage full) keeps the
  previous save. If storage is blocked, slots fall back to memory and the dialog says so.
- **Autosave** writes 400 ms after the last action, and immediately when the page is
  hidden or closed. On startup an in-progress autosave is verified and resumed.
- **Files**: export downloads compact JSON named `<mapId>-day-<n>-<date>.json`; import
  refuses files over 8 MB before reading them.
- **Cost**: saving is one `JSON.stringify`; loading is one replay of the log plus two
  serializations of the final state.

## 7. Sprite pipeline

1. **Author**: one SVG per sprite frame in `packages/sprites/src/svg`, 48x48 viewBox,
   `<polygon>` elements only, fills drawn only from `palette.ts`. A lint step in the
   build rejects any other element, stroke, gradient, or off-palette colour.
2. **Team colour**: four placeholder fills (light, mid, dark, accent) are swapped for
   each faction's ramp by string substitution on the SVG source before rasterising.
   Team-coloured sprites get four copies (one atlas row per faction) plus a neutral
   ramp for buildings; terrain and UI are emitted once.
3. **Rasterise + pack**: `buildAtlas.ts` (Node, `@resvg/resvg-js` + `pngjs`) renders at
   1x and 2x with anti-aliasing off, packs on a fixed 48px grid, and writes
   `atlas@1x.png`, `atlas@2x.png`, and one `atlas.json`
   (`{ [spriteId]: { x, y, w, h, frames } }`, faction as a row offset).
4. **Registry**: `getFrame(spriteId, faction, frame)` returns a source rect. IDs are
   namespaced: `unit.tank`, `terrain.forest`, `building.city`, `ui.cursor`. The
   renderer only knows IDs, so art can be replaced without renderer changes. Units
   are authored facing right and mirrored with a flipped `drawImage` for left.
5. **Autotiling**: terrain content may declare
   `autotile: { connectsTo: string[], variants: Record<mask, spriteId> }`. The renderer
   computes a 4-bit N/E/S/W mask per tile and looks the variant up. It is generic and
   data-driven: road, bridge, and coast opt in now; river, shoal, and pipes can later.
   Coast edges are an overlay pass on sea tiles using the same mask against "is land".

## 8. Renderer and UI

- One `<canvas>` in a React component; DOM menus/panels/HUD are positioned over it.
- `render(state, anim, camera, ui)` is a pure read of its inputs (rule 8).
- **Layers**: (1) terrain + buildings, pre-rendered to an offscreen canvas and redrawn
  only when the map or an owner changes; (2) overlays (range, path arrow); (3) units;
  (4) effects and cursor. A frame is one blit of layer 1 plus only the visible units.
- **Loop**: `requestAnimationFrame` with a dirty flag. An idle board with no tween and
  no idle-frame flip draws nothing. This is the basis of the 60 fps target on 30x20.
- **Culling**: only tiles within the camera rect are iterated.
- **Camera**: pan + integer zoom (1x-4x), all coordinates rounded,
  `imageSmoothingEnabled = false`; atlas 2x is selected when `zoom * devicePixelRatio >= 2`.
- **Tweens**: slide-along-path, attack bump, capture hop, destroy puff. They are driven
  by engine `events`, live in transient animation state, and block input until done.
- **Zustand (UI only)**: cursor, interaction mode (`idle | moving | actionMenu |
targeting | unloading | buildMenu | mapMenu`), selected unit, cached reachable set,
  previewed path, whether the save dialog is open, and camera. Game state lives in
  `GameSession`, not in the store; React subscribes to it through
  `useSyncExternalStore`.
- **Input**: mouse (click select/confirm, right-click cancel, drag pan, wheel zoom) and
  keyboard (arrows/WASD cursor, Enter/Space confirm, Esc cancel, E end turn).
- **Layout**: canvas fills the viewport; panels dock to the side on desktop and to the
  bottom below about 900px width.

## 9. Testing

| Area        | Tests                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movement    | range per move type and terrain, fuel limit, blocking, pass-through                                                                                              |
| Combat      | formula against hand-computed cases, luck determinism per seed, counterattack, indirect rules, ammo                                                              |
| Capture     | progress by HP, reset on leaving, HQ capture wins                                                                                                                |
| Supply      | property repair cost and cap, resupply, APC supply, joining                                                                                                      |
| Win         | HQ capture, rout                                                                                                                                                 |
| Determinism | same seed + same log gives the same state hash                                                                                                                   |
| Save        | save -> JSON -> load gives an identical state; edited, truncated, illegal and foreign-rules saves are refused; migration chain; slot index rebuild; storage full |
| Map         | Twin Fords converts and matches the property check in 5.3                                                                                                        |
| Content     | all content passes zod; every armed unit has targets; primary weapons need ammo                                                                                  |
| Perf        | range query and 1000 random legal actions on a 30x20 map within a time budget                                                                                    |

## 10. Phase 1 build order

1. Workspace scaffold, lint, tsconfig, CI scripts
2. Engine: types, ruleset compile, grid, RNG, pathfinding, with tests
3. Content: schemas, units, terrain, damage, ASCII converter, Twin Fords, with tests
4. Engine: all Phase 1 actions, turn cycle, win conditions, with tests
5. Sprites: palette, SVGs, atlas build, registry
6. Web: renderer, camera, input, session, menus, info panels, damage preview
7. Full hot-seat playthrough and the 30x20 performance check
