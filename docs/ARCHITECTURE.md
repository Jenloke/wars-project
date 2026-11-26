# Architecture

Status: **Phases 1 to 4 approved.**
Sections below describe the code as built.
Commit conventions are in [COMMITS.md](COMMITS.md).

Run it: `pnpm install`, then `pnpm dev` (starts Vite).
Checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## 0. Deviations from SPEC.md

| Spec item                                      | Change                                                    | Reason                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First map "Spann Island", transcribed exactly  | Replaced by an original map, **Twin Fords** (section 5.3) | Spann Island is a level from the commercial game. The ASCII format, converter, legend, and property-check test are all kept; only the layout is original. |
| "the damage table"                             | Original base-damage numbers, tuned for this game         | The formula shape is a genre mechanic; the commercial game's exact matrix is not copied.                                                                  |
| Four workspace packages                        | A fifth, `packages/ai`, holds the computer opponent       | The AI then reaches the game only through the engine's public API, like any other player, and network play can reuse it outside the web app.              |
| SVGs rasterised into an atlas PNG at 1x and 2x | SVGs rasterised at runtime, at the exact tile size        | Asked for in phase 4: art is sharp at any zoom and display scale, a new sprite is just a new file, and team colours are applied when drawing (section 8). |
| Subs with dive                                 | A dived unit stays visible to its opponent                | Hiding it needs per-player visibility, which arrives with fog of war (deferred by the spec). `Unit.dived` is in state for that phase to use.              |

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
      rules.ts               # predicates shared by the reducer, option listing and the AI
      options.ts             # what a unit or base can do (menus and the AI)
      applyAction.ts         # reducer entry point
      hash.ts                # FNV-1a state hash (desync detection)
      controller.ts          # PlayerController interface
      save/                  # save format, replay verification, migrations
    test/
  ai/                        # computer opponent. Depends on the engine's public API only.
    src/
      chooseAction.ts        # entry point: the next action for the active player
      board.ts               # per-decision read of the position: threats, danger
      plan.ts                # capture assignments, property values
      tactics.ts             # attack, capture and supply scoring
      movement.ts            # roles, goal fields, best tile to move to, dive or surface
      fuel.ts                # how far home to refuel, when to turn back
      production.ts          # what to build, to counter the enemy army
      distance.ts            # terrain-only Dijkstra fields
      profile.ts             # tuning weights (DEFAULT_PROFILE)
    test/
  content/                   # data + zod schemas. Depends on engine types only.
    src/
      schemas.ts
      ruleset.ts             # assembles and validates the RawRuleset
      units.ts  terrain.ts  moveTypes.ts  damage.ts  commanders.ts  factions.ts
      visuals.ts             # how units and terrain are drawn: conventions, overrides
      maps/ascii.ts          # ASCII -> MapJson converter + legend
      maps/twinFords.ts  maps/ternReach.ts
      maps/registry.ts
      saves.ts               # save file schema + readSave (parse, migrate, verify)
      index.ts               # public API: ruleset, map registry, readSave
    test/
  sprites/
    src/svg/{terrain,building,unit,ui,fx}/*.svg
    src/palette.ts           # shared palette + team placeholders -> faction ramps
    src/svg.ts               # parse one SVG frame into polygons, enforcing the art rules
    src/raster.ts            # scanline polygon fill at any size, with recolour and shade
    src/library.ts           # SpriteLibrary: sprite ID -> frames, with fallbacks
    src/sources.ts           # every SVG bundled as text, parsed at startup
apps/
  web/
    src/
      render/                # camera, sprite cache, terrain layer, autotile, units, overlays, tweens
      input/                 # pointer + keyboard -> UI intents
      store/                 # zustand: UI state only
      session/               # GameSession: game record + action loop; local and AI controllers
      saves/                 # local storage slots, autosave, file export/import
      ui/                    # React DOM: menus, panels, HUD
      App.tsx  main.tsx
```

Dependency direction: `web -> ai, sprites, content, engine`; `ai -> engine`;
`content -> engine (types)`; `engine -> nothing`; `sprites -> nothing`. The AI's tests also
load `content`, for the real ruleset and maps, and the web app's tests check content
against the sprites. Enforced with ESLint `no-restricted-imports`.

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
  dived: boolean; // under water, out of reach of most attackers (schema 2)
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
(rule 4), and it is appended so stored indices keep their meaning. All seven move types
(`foot`, `mech`, `tread`, `tire`, `air`, `sea`, `lander`) are rows in the cost table from
day one (rule 5).

A unit definition can also carry:

| Field                   | Meaning                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `tags`                  | Free-form classes (`ground`, `infantry`, `naval`, `air`, `copter`, ...) that selectors name                        |
| `transport`             | `{ capacity, carries }`; `carries` is a list of selectors                                                          |
| `fuelPerDay`            | Fuel used at the start of each of the owner's turns, on top of what moving costs                                   |
| `lostWithoutFuel`       | Crashes or sinks when that leaves its tank empty                                                                   |
| `ignoresTerrainDefence` | Takes no defence stars from the tile below (aircraft)                                                              |
| `dive`                  | `{ fuelPerDay, attackableBy }`: can dive; while dived it burns this instead, and only `attackableBy` can attack it |

A **selector** names a group of units in rules data: it matches a unit whose ID, move type
or one of whose tags equals it, so `["infantry"]`, `["tread"]` and `["cruiser"]` all work.
Compilation turns selector lists into per-unit-type tables (`carries`, `divedAttackers`)
and throws on a selector that matches no unit, since that can only be a typo.

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
  | { type: 'Dive'; unit: UnitId; path: TileIndex[] }
  | { type: 'Surface'; unit: UnitId; path: TileIndex[] }
  | { type: 'Build'; at: TileIndex; unitType: number }
  | { type: 'EndTurn' }
  | { type: 'Resign' };
// Phase 5 addition: ActivatePower
```

- Move-then-act is one atomic action, so the log never holds a half-finished turn step.
- `applyAction(ruleset, state, action): Result` where
  `Result = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string }`.
  Every action is validated (ownership, path legality and cost, range, funds); an
  illegal action never changes state. This is what makes remote play host-authoritative.
- `events` (`UnitMoved`, `Damaged`, `Destroyed`, `Captured`, ...) are a by-product for
  the renderer's tweens. They are not part of state and not needed to replay.
- `EndTurn` runs the next player's start-of-turn, in this order: income; daily fuel use
  (`fuelPerDay`, or the dive rate while dived; units in a transport use none); repair and
  resupply on owned properties and supply from adjacent supply units; then every
  `lostWithoutFuel` unit left with an empty tank crashes or sinks with its cargo
  (`UnitDestroyed` with `cause: 'fuel'`), routing the player if it was their last. Because
  resupply comes first, a unit that ends its turn on an airport or beside an APC is safe.
- `Dive` and `Surface` are orders after a move, like `Capture`, for units with a `dive`
  rule.
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

Defence stars come from the defender's tile, except for units that `ignoresTerrainDefence`
(aircraft), which get none. A dived defender can only be targeted by the units its dive
rule names; everything else has no weapon against it, cannot attack it and cannot return
its fire. A dived unit can still attack.

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
an action, apply it, append to the log, publish the new state and events. A factory
builds each seat's controller from the game's `setup`: `ai` seats get an `AiController`
(section 7), every other seat a `LocalController` that waits for the UI to submit an
action. Remote seats play locally until network play exists.

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

| Char | Meaning  | Char | Meaning        | Char | Meaning           |
| ---- | -------- | ---- | -------------- | ---- | ----------------- |
| `~`  | Sea      | `C`  | City, neutral  | `Q`  | Port, neutral     |
| `.`  | Plains   | `H`  | HQ, Player 1   | `P`  | Port, Player 1    |
| `=`  | Road     | `R`  | Base, Player 1 | `p`  | Port, Player 2    |
| `F`  | Forest   | `h`  | HQ, Player 2   | `T`  | Airport, neutral  |
| `M`  | Mountain | `b`  | Base, Player 2 | `A`  | Airport, Player 1 |
| `B`  | Bridge   | `:`  | Shoal          | `a`  | Airport, Player 2 |
|      |          | `*`  | Reef           |      |                   |

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

### 5.4 Naval and air map: Tern Reach (original)

20 x 14, 180-degree rotationally symmetric. Each home island has an HQ, two bases, a port
and an airport; bridges join both to a central island with two neutral airports and two
cities. An islet city off each flank can only be reached by lander or copter.

```
     x: 0         1
        01234567890123456789
  y=0   ~~~~~~~~~~~~~~~~~~~~
  y=1   ~HR==.F.:~~~*~~~~~~~
  y=2   ~R.F=.M.C~~~~~~:.~~~
  y=3   ~A==C==.P~~*~~~.C~~~
  y=4   ~:..F.=F.~~~~~:.F.~~
  y=5   ~~C.:.==:~~~~~~~~*~~
  y=6   ~~~~~~~B~CT..:~~~~~~
  y=7   ~~~~~~:..TC~B~~~~~~~
  y=8   ~~*~~~~~~~~:==.:.C~~
  y=9   ~~.F.:~~~~~.F=.F..:~
  y=10  ~~~C.~~~*~~p.==C==a~
  y=11  ~~~.:~~~~~~C.M.=F.b~
  y=12  ~~~~~~~*~~~:.F.==bh~
  y=13  ~~~~~~~~~~~~~~~~~~~~
```

Property check (asserted by the content test): Player 1 HQ (1,1), bases (2,1), (1,2),
airport (1,3), port (8,3); Player 2 HQ (18,12), bases (18,11), (17,12), airport (18,10),
port (11,10); neutral airports (10,6), (9,7); ten neutral cities. 22 properties; 168 sea,
36 plains, 20 road, 14 shoal, 10 forest, 6 reef, 2 mountain, 2 bridge.

### 5.5 Terrain and buildings

| Terrain | Stars | Who can enter                   | Notes                                            |
| ------- | ----- | ------------------------------- | ------------------------------------------------ |
| Shoal   | 0     | Ground units, landers, aircraft | Where landers can load and unload                |
| Reef    | 1     | Ships (2 movement), aircraft    | Breaks up sea lanes                              |
| Port    | 3     | Ground units, ships, aircraft   | Builds ships; repairs and resupplies ships       |
| Airport | 3     | Ground units, aircraft          | Builds aircraft; repairs and resupplies aircraft |

### 5.6 Ships and aircraft

| Unit             | Cost  | Fuel / day  | Notes                                                                         |
| ---------------- | ----- | ----------- | ----------------------------------------------------------------------------- |
| Lander           | 12000 | 1           | Carries two ground units; they board and land only from a shoal or port       |
| Cruiser          | 18000 | 1           | Torpedoes for submarines, anti-air guns, carries two copters                  |
| Submarine        | 20000 | 1 (5 dived) | Torpedoes against ships; dived, only cruisers and submarines can reach it     |
| Battleship       | 28000 | 1           | Range 2-6 against ships and the coast; cannot move and fire                   |
| Transport Copter | 5000  | 2           | Carries one infantry or mech anywhere it can set down                         |
| Battle Copter    | 9000  | 2           | Missiles against vehicles and ships, machine gun against infantry and copters |
| Fighter          | 20000 | 5           | Hits only aircraft                                                            |
| Bomber           | 22000 | 5           | Devastating against ground units and ships, harmless to aircraft              |

Every ship and aircraft is lost when its fuel runs out, and aircraft take no terrain cover.
Anti-air guns and missiles shoot down aircraft; ground machine guns can graze copters.

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
  at a time, keyed by the version they upgrade from. Saves from a newer build are refused.
  Format 2 (phase 4) gave every unit `dived` and moved the state to schema 2; the 1 -> 2
  step adds `dived: false` after the existing keys, so the migrated snapshot still matches
  a replay byte for byte. A real format 1 save from the phase 3 build is kept as a test
  fixture and must keep loading. New units and terrain were appended and no existing
  matchup changed, so phase 3 logs replay to the same game and the ruleset ID is still
  `core-1`.
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

## 7. Computer opponent

`chooseAction(ruleset, state, profile?)` (`packages/ai`) returns the next action for the
active player. The `AiController` calls it once per action, so the AI reads the
position afresh after every move and reacts to how each attack actually rolled. Its
actions go through the reducer, the log and saves like anyone else's.

**One decision**, in order of preference:

1. **Tactics.** Every attack, capture and supply an unmoved unit could make this turn,
   scored in funds; the best positive one is taken.
   - _Attack_: expected damage over all luck rolls, times the target's cost, plus a kill
     bonus; less the expected counterattack and part of the danger at the firing tile.
     Only favourable trades score above zero. Hitting an enemy that would capture our
     HQ next turn is worth as much as winning.
   - _Capture_: the property's value (days of income, more for bases, HQs and enemy
     property) if it finishes this turn, else a share for the progress made. Taking an
     enemy HQ wins.
   - _Supply_: what the refill is worth to adjacent friends low on fuel or ammo.
2. **Movement.** Each unmoved unit gets a role and a goal field (terrain-only Dijkstra
   to the goal): repair when worn down, walk to its assigned property, close in on
   enemies it can hurt (artillery aims for its range band), escort friends, march on
   enemy property, or step off a base it blocks. It moves to the reachable tile that
   best trades progress against danger, terrain cover, a free base and guarding a
   threatened HQ. Units nearest their goals move first.
3. **Production.** At the free base nearest the enemy, the unit with the best value
   against the enemy army: what it should take off that army over its life (damage per
   engagement, either side starting it, divided by the share of its own HP it loses),
   less its price and a penalty for types the army already has many of. Capturers are
   kept while properties are unclaimed; funds are split across free bases.
4. **End turn.**

Every step acts with a unit (which is then spent) or fills a base, so the turn always
ends. Every candidate is checked with `applyAction` before it is returned.

**Reading the board** (`board.ts`, rebuilt per decision): which enemies could fire on
each tile next turn (their reach, blocked by our units, plus weapon range; indirect
units only from where they stand), where enemy capturers can reach, and a _danger_
estimate per unit and tile: the worst attacker in full plus a share of the rest, less
part of our counterattack. A caution factor scales danger by the army value ratio, so
the stronger side presses on.

**Capture plan** (`plan.ts`): capturers and unowned properties are paired cheapest
first, by turns of walking less a priority for HQs, bases and enemy property, so each
property gets one unit and a unit mid-capture keeps its property.

**Fair play and determinism**: the AI sees units, terrain and funds, which are public
without fog of war. It never reads `state.rng`, so it cannot foresee luck. Given the
same state it always returns the same action (ties break by unit id and tile).

**Tuning** lives in `DEFAULT_PROFILE`, not the ruleset: it changes how the AI plays,
never what a log replays to, so it needs no ruleset id bump. Difficulty levels can be
other profiles.

**Cost**: a decision on Twin Fords takes well under a millisecond; a full turn with 20
units a side on a 30x20 map is tested to finish within budget.

**Ships and aircraft**:

- _Fuel_: a unit that would crash or sink turns for home once one more day out would leave
  it unable to reach an owned property that refuels it (the trip, each day's burn on the
  way, and `fuelReserve`), and heading out it never stops where it could not get back
  from. Owned properties that could repair a worn-down friend are reserved: units that
  cannot be repaired there keep off them, units parked on one move first, and a unit that
  has come to repair is not shooed off a building that could build.
- _Diving_: a unit that can dive ends each move dived when enemies that could hit it
  surfaced are in range and diving puts it out of their reach, and surfaced otherwise
  (diving burns fuel five times as fast), or when the dived burn would strand it.
- _Production_ only counts units the map's properties can build, and only buys a unit
  that can get from its building to where it can fire on an enemy unit or property (or,
  for capturers, onto one), so a port on an enclosed lake buys nothing.
- _Cover_: aircraft are not credited with the terrain under them.

On Tern Reach the computer playing itself fields copters, bombers and ships and, over 60
days on every seed tried, loses none of them to fuel.

**In the web app** the `AiController` waits until the last move has finished
animating and no dialog is open, then pauses 250 ms so a player can follow each move;
the camera and cursor follow its actions. If the reducer ever refused one of its
actions, it would end the turn rather than retry forever.

**Not yet**: the AI does not load or unload transports (so it never builds landers or
transport copters), join units, or save funds for a later build. Mirror matches on a
symmetric map tend toward long wars of attrition.

**Cost**: a full 60-day self-play game on Tern Reach takes about 4 seconds.

## 8. Sprite pipeline

Sprites are vector art all the way to the screen: there is no build step and no PNG.

1. **Author**: one SVG per sprite frame in `packages/sprites/src/svg`, 48x48 viewBox,
   `<polygon>` elements only, fills drawn only from `palette.ts` or the four team
   placeholders. The file's path is its ID: `unit/tank.f1.svg` is frame 1 of `unit.tank`,
   folders become ID segments, and frames are numbered from `f0` without gaps.
2. **Load**: `sources.ts` bundles every SVG as text (`import.meta.glob`), and
   `SpriteLibrary` parses each into polygons at startup, rejecting any other element,
   stroke, gradient, opacity or off-palette colour with the file name. The sprite tests
   load every shipped SVG, so bad art fails CI. Sprites can also be added at runtime
   (`library.add`).
3. **Rasterise**: `rasterize(frame, size, { ramp, shade })` scanline-fills the polygons
   into an RGBA buffer of any size. A pixel takes a polygon's colour when its centre is
   inside it (as SVG `crispEdges`), so edges stay hard at every size. Team placeholders
   are swapped for the owner's ramp as the pixels are written, and `shade` darkens units
   that have acted. Four faction ramps and a neutral one live in `palette.ts`.
4. **Cache**: the renderer's `SpriteCache` keeps one canvas per sprite, frame, colour
   variant and shade at the current tile size, made on first use and dropped when the
   size changes. Zooming or moving the window to another display re-rasterises from the
   vectors instead of scaling pixels.
5. **IDs and fallbacks**: the renderer only knows IDs, resolved once per ruleset through
   the content visuals (`visuals.ts`). By convention unit `x` is `unit.x`, terrain `x` is
   `terrain.x` and a property `x` is `building.x` in its owner's colours; entries in
   `unitVisuals` and `terrainVisuals` override only what differs (autotiling, overlays,
   another sprite, flying height). Content with no art yet is drawn with placeholders
   (`unit.unknown`, `building.unknown`, `terrain.unknown`), so new content is playable
   before it has art. Units are authored facing right and mirrored for odd player slots.
6. **Autotiling**: terrain may declare
   `autotile: { connectsTo: string[], variants?: Record<mask, spriteId> }`. The renderer
   computes a 4-bit N/E/S/W mask per tile and looks the variant up. Road and bridge
   connect to properties, and coast edges are an overlay on sea and reef tiles against
   land, shoals, ports and airports.
7. **Air and water**: units with a `lift` (aircraft, by move type) are drawn that many
   grid units up with `ui.shadow` faintly below; a dived unit is drawn see-through with
   the animated `ui.submerged` water over its hull.

## 9. Renderer and UI

- One `<canvas>` in a React component; DOM menus/panels/HUD are positioned over it.
- `render(state, anim, camera, ui)` is a pure read of its inputs (rule 8).
- **Layers**: (1) terrain + buildings, planned once per map and ownership change (which
  sprite goes on each tile) and drawn into a view-sized layer that is only redrawn when
  the plan, the camera or the tile size changes; (2) overlays (range, path arrow);
  (3) units; (4) effects and cursor. An animated frame is one blit of layer 1 plus only
  the visible units.
- **Loop**: `requestAnimationFrame` with a dirty flag. An idle board with no tween and
  no idle-frame flip draws nothing. This is the basis of the 60 fps target on 30x20.
- **Culling**: only tiles within the camera rect are iterated.
- **Camera**: pan + integer zoom (1x-4x), all coordinates rounded. A tile is
  `round(48 * zoom * devicePixelRatio)` device pixels, so it is 48 CSS pixels per zoom
  step even at 125% or 150% display scaling, and sprites are rasterised at exactly that
  size.
- **Tweens**: slide-along-path, attack bump, capture hop, destroy puff (also for units lost
  to fuel). They are driven by engine `events`, live in transient animation state, and
  block input until done. The turn banner names any units that crashed or sank as the
  turn began.
- **Zustand (UI only)**: cursor, interaction mode (`idle | moving | actionMenu |
targeting | unloading | buildMenu | mapMenu`), selected unit, cached reachable set,
  previewed path, which dialog is open (save and load, or new game), and camera. Game
  state lives in
  `GameSession`, not in the store; React subscribes to it through
  `useSyncExternalStore`.
- **Input**: mouse (click select/confirm, right-click cancel, drag pan, wheel zoom) and
  keyboard (arrows/WASD cursor, Enter/Space confirm, Esc cancel, E end turn). During a
  computer turn the cursor still moves for inspection, but no orders are accepted.
- **New game**: a dialog picks the map and whether a person or the computer plays each
  side (default: you against the computer).
- **Layout**: canvas fills the viewport; panels dock to the side on desktop and to the
  bottom below about 900px width.

## 10. Testing

| Area        | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movement    | range per move type and terrain, fuel limit, blocking, pass-through                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Combat      | formula against hand-computed cases, luck determinism per seed, counterattack, indirect rules, ammo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Capture     | progress by HP, reset on leaving, HQ capture wins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Supply      | property repair cost and cap, resupply, APC supply, joining                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Win         | HQ capture, rout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Air, naval  | cargo by tag, ID and move type; daily fuel only on the owner's turn and not in transports; crash, sink with cargo, rout by fuel; refuel on airport or beside an APC first; dive and surface; only listed units hit a dived unit, others cannot counter it; dived fuel rate; aircraft take no cover                                                                                                                                                                                                                                                                                                         |
| Determinism | same seed + same log gives the same state hash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Save        | save -> JSON -> load gives an identical state; edited, truncated, illegal and foreign-rules saves are refused; migration chain; format 1 -> 2 adds `dived` in key order; a real phase 3 save still loads; slot index rebuild; storage full                                                                                                                                                                                                                                                                                                                                                                 |
| Map         | Twin Fords and Tern Reach convert and match their property checks (5.3, 5.4); symmetry; ports face open water                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Content     | all content passes zod; every armed unit has a target and every unit can be hit; primary weapons need ammo; buildings build what can stand on them; ports repair ships, airports aircraft; cargo and dive rules; visual conventions                                                                                                                                                                                                                                                                                                                                                                        |
| Sprites     | every shipped SVG passes the art rules; parse errors; IDs and frames from paths; fallbacks; rasteriser fills exact pixel centres at any size, layers, recolours and shades; every unit and terrain has its own art (web)                                                                                                                                                                                                                                                                                                                                                                                   |
| Perf        | range query and 1000 random legal actions on a 30x20 map within a time budget                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AI          | distance fields, threat map and danger; attack forecasts; favourable trades only; kills first; captures and HQ defence; retreat, artillery spacing, base clearing; capture plan; builds that counter the enemy; beats an idle opponent; plays itself legally; deterministic; ignores the RNG; turn time on 30x20; turns aircraft home in time and never flies past the point of return; clears an airport for a damaged aircraft; repairs on a base that could build; dives under threat and surfaces otherwise or to get home; no ships from a landlocked port; 60 days of Tern Reach without a fuel loss |
| Session     | computer turns follow local ones; local input ignored on computer turns; computer moves save and replay exactly; a computer seat resumes on load; controller waits for the board and ends the turn after a refused move                                                                                                                                                                                                                                                                                                                                                                                    |

## 11. Adding content

Units, terrain and buildings are data, and their art is found by name, so new content
needs no engine, renderer or AI change.

**A unit**

1. Append it to `packages/content/src/units.ts` (append only: states store unit types by
   index). Give it `tags` (`ground`, `naval`, `air`, plus finer ones such as `infantry` or
   `copter`) so cargo rules and build lists can name it as a group. Optional abilities:
   `transport: { capacity, carries }`, `fuelPerDay` with `lostWithoutFuel`,
   `ignoresTerrainDefence`, `dive: { fuelPerDay, attackableBy }`.
2. Give it a row in `damage.ts` for what it can hit, and add it to the rows of what can
   hit it. Rows are sparse; a unit missing from a row cannot be hit by that weapon.
3. Make something build it: the base, port and airport build lists come from tags, or
   list it in a property's `builds`.
4. Draw it: `packages/sprites/src/svg/unit/<id>.f0.svg` and `.f1.svg` (polygons, palette
   colours, team placeholders for team colours; see section 8). Until the files exist it
   plays as a team-coloured placeholder crate. An entry in `unitVisuals` can point it at
   another sprite or change how high it flies.

The content tests then check its damage rows, that its buildings can hold it, and (in
`apps/web/test`) that its art exists.

**A unit-producing building** is a terrain entry with a `property`: append it to
`terrain.ts` with `builds` (unit IDs) and `repairs` (move types it services), add a
character for it to the ASCII legend, and draw `svg/building/<id>.svg` with team
placeholders so it shows its owner. Without art it is a generic team-coloured depot. The
build menu, repair and resupply, capture, income and the AI's production all read the
property data, so it works everywhere at once.

**Terrain** is the same without `property`: `svg/terrain/<id>.svg`, or an `autotile`
rule in `terrainVisuals` and one sprite per neighbour mask.

## 12. Phase 1 build order

1. Workspace scaffold, lint, tsconfig, CI scripts
2. Engine: types, ruleset compile, grid, RNG, pathfinding, with tests
3. Content: schemas, units, terrain, damage, ASCII converter, Twin Fords, with tests
4. Engine: all Phase 1 actions, turn cycle, win conditions, with tests
5. Sprites: palette, SVGs, atlas build, registry (replaced by runtime rasterising in phase 4)
6. Web: renderer, camera, input, session, menus, info panels, damage preview
7. Full hot-seat playthrough and the 30x20 performance check
