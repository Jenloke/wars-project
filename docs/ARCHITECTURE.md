# Architecture

Status: **Phases 1 to 4 approved; phase 5 awaits approval.**
Sections below describe the code as built.
Commit conventions are in [COMMITS.md](COMMITS.md); test coverage is specified in
[TESTING.md](TESTING.md).

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
      commanders.ts          # the modifiers in effect for a player (innate, plus power)
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
      units.ts  terrain.ts  moveTypes.ts  damage.ts  factions.ts
      commanders.ts          # commanders (rules) and their profiles (army, colours, bio)
      commanderText.ts       # plain-language descriptions written from commander data
      visuals.ts             # how units and terrain are drawn: conventions, overrides
      maps/ascii.ts          # ASCII -> MapJson converter + legend
      maps/twinFords.ts  maps/ternReach.ts
      maps/registry.ts
      saves.ts               # save file schema + readSave (parse, migrate, verify)
      index.ts               # public API: ruleset, map registry, readSave
    test/
  sprites/
    src/svg/{terrain,building,unit,portrait,ui,fx}/*.svg
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
      session/               # GameSession: game record + action loop; controllers; armies
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
  power: number; // power meter, in meter points
  controller: 'local' | 'ai' | 'remote';
  alive: boolean;
  powerActive: boolean; // from activating the power until this player's next turn (schema 3)
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
  | { type: 'ActivatePower' }
  | { type: 'EndTurn' }
  | { type: 'Resign' };
```

- Move-then-act is one atomic action, so the log never holds a half-finished turn step.
- `applyAction(ruleset, state, action): Result` where
  `Result = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string }`.
  Every action is validated (ownership, path legality and cost, range, funds); an
  illegal action never changes state. This is what makes remote play host-authoritative.
- `events` (`UnitMoved`, `Damaged`, `Destroyed`, `Captured`, ...) are a by-product for
  the renderer's tweens. They are not part of state and not needed to replay.
- `EndTurn` runs the next player's start-of-turn, in this order: the end of any power
  they activated last turn; income (with their commander's income modifier), which also
  charges their meter; daily fuel use (`fuelPerDay`, or the dive rate while dived; units in
  a transport use none); repair and resupply on owned properties (with any extra repair
  their commander gives) and supply from adjacent supply units; the commander's free
  healing (`regen`); then every `lostWithoutFuel` unit left with an empty tank crashes or
  sinks with its cargo (`UnitDestroyed` with `cause: 'fuel'`), routing the player if it was
  their last. Because resupply comes first, a unit that ends its turn on an airport or
  beside an APC is safe.
- `ActivatePower` spends the active player's meter on their commander's power (section
  4.3). It can be used at any point in their turn, between unit orders.
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

`atkMod` and `defMod` are the commander percentages in effect for each side (100 =
unmodified; innate modifiers, plus the power's while it is active). The whole expression
is evaluated in integer arithmetic so every platform agrees. Each unit
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

### 4.3 Commanders (rule 7)

A commander is data: innate modifiers, at most one power, and the rates its power meter
charges at. Effects are data-described modifiers the engine evaluates, never functions,
so state and content stay serializable. Commander 0 is the no-op default.

```ts
interface RawCommanderDef {
  id: string;
  name: string;
  modifiers: RawModifier[]; // innate, always in effect
  charge?: RawCharge; // how the meter fills; defaults to DEFAULT_CHARGE
  power?: { name: string; cost: number; modifiers: RawModifier[]; effects?: RawPowerEffect[] };
}
interface RawModifier {
  hook:
    | 'attack'
    | 'defence'
    | 'movement'
    | 'cost'
    | 'range'
    | 'capture'
    | 'repair'
    | 'regen'
    | 'income';
  units?: UnitSelector[]; // omit for all units
  value: number;
}
```

| Hook       | Value                                       | Applied in                                               |
| ---------- | ------------------------------------------- | -------------------------------------------------------- |
| `attack`   | percentage points on 100                    | damage formula (`atkMod`)                                |
| `defence`  | percentage points on 100                    | damage formula (`defMod`)                                |
| `movement` | move points added (never below 0)           | movement budget                                          |
| `cost`     | percentage points on 100                    | build price, repair price, join refunds, meter value     |
| `range`    | tiles added to an indirect unit's max range | attack validation, targets, AI threat map                |
| `capture`  | percentage of displayed HP removed per turn | capture (at least 1 point)                               |
| `repair`   | internal HP added to a property's repair    | start-of-turn repair, still paid for                     |
| `regen`    | internal HP recovered free at start of turn | every unit, anywhere, carried ones too; never below 1 HP |
| `income`   | percentage points on 100 (takes no `units`) | income each turn, and the opening funds                  |

Selectors are the cargo-rule selectors (section 3.1) plus two classes every unit belongs
to by its weapons: `direct` (max range 1) and `indirect` (max range above 1). `range` only
ever stretches indirect fire; a direct unit firing from two tiles away would break the
rule that only adjacent units trade blows. A selector that matches no unit fails the
compile.

**Compiled form.** Each commander compiles to two `CompiledModifiers` sets of per-unit-type
typed arrays: `passive` (innate) and `powered` (innate plus the power's). `modifiersOf(ruleset,
state, player)` returns the set in effect, and every rule reads through it or the helpers
built on it (`movePointsOf`, `unitCost`, `maxRangeOf`, `captureAmount`, `incomeOf`), so
menus, the AI and the reducer always agree. Hot paths stay array lookups.

**Powers.** `ActivatePower` needs a commander with a power, a meter holding at least its
cost, and the power not already active (`powerBlocker` gives the reason for menus). It
spends the cost, sets `powerActive`, emits `PowerActivated`, and applies the power's
one-off effects with its modifiers already in effect:

| Effect     | Does                                                        |
| ---------- | ----------------------------------------------------------- |
| `heal`     | units it names regain `hp` internal HP for free, up to full |
| `resupply` | units it names are refilled with fuel and ammo              |
| `funds`    | pays `incomePercent` percent of a day's income at once      |

The power's modifiers last until the start of that player's next turn, so a defensive
power holds through the opponent's turn.

**The meter** is counted in meter points. Each commander's `charge` gives a rate per source:

| Source        | Points                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| `damageDealt` | percent of the funds value of damage its units deal (attacks and counters) |
| `damageTaken` | percent of the funds value of damage its units take                        |
| `kills`       | percent of the cost of each enemy unit destroyed, on top of the damage     |
| `captures`    | points per property captured (not for progress)                            |
| `income`      | percent of the funds collected at the start of each turn                   |

The funds value of damage is the damaged unit's cost (after its own commander's cost
modifier) times the share of its HP lost. The meter holds no more than the power's cost
and does not charge while the power is active. `DEFAULT_CHARGE` (all of the damage taken,
half of the damage dealt, nothing else) is the rule every meter followed before commanders
had rates, and commanders without a power keep counting past any cap as before, so saves
from phases 1 to 4 replay to the same meters.

**The shipped commanders** (`packages/content/src/commanders.ts`), one per mechanic, each
charging fastest from what it does best:

| Commander, army               | Innate                                                                        | Power (cost)                                                                      | Meter fills fastest from |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| Iska Varn, Cinder Legion      | +20% firepower, -5% defence                                                   | Firestorm (26000): +35% firepower                                                 | damage dealt, kills      |
| Corvin Ash, Tidewatch         | +15% defence, vehicles -1 movement                                            | Iron Line (28000): +25% defence                                                   | damage taken             |
| Odile Penn, Sunward Compact   | +15% income, -10% firepower                                                   | Windfall (28000): a day's income at once, units 20% cheaper                       | captures, income         |
| Halden Moss, Fernhold Wardens | every unit recovers 1 HP a turn, properties repair 1 HP more, units +10% cost | Triage (26000): heal 3 HP, resupply, +10% defence                                 | damage taken, income     |
| Orla Teague, Dusk Syndicate   | indirect +1 range and +15% cost, direct -10% firepower                        | Barrage (28000): indirect +1 more range and +20% firepower                        | damage dealt             |
| Pip Harrow, Free Banners      | +50% capture speed, infantry and mechs 25% cheaper                            | Flag Rush (22000): +100% more capture speed, infantry +1 movement, +15% firepower | captures                 |

The numbers were tuned with the computer playing every pairing on Twin Fords for 30 days
on two seeds: each commander came out ahead in 7 to 15 of its 20 games, and powers fired
every three or four days. On Tern Reach the economy and capture commanders do better, as
a larger map with more properties should allow.

**Presentation** lives beside the rules in content: a `CommanderProfile` per commander
(title, bio, innate ability name, and the army it leads with that army's four team
colours), and `describeCommander`, which writes the innate, power and meter text from the
rules data, so no hand-written rules text can drift from the numbers. Section 9 covers
how armies are coloured.

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
  a replay byte for byte. Format 3 (phase 5) gave every player `powerActive` and moved the
  state to schema 3; the 2 -> 3 step adds `powerActive: false` last, as new players have it.
  A real format 1 save from the phase 3 build is kept as a test fixture and must keep
  loading, through both steps, with its meters at the values it was saved with. New units and terrain were appended and no existing
  matchup changed, so phase 3 logs replay to the same game and the ruleset ID is still
  `core-1`. Phase 5 appended commanders after the unchanged default one and kept the
  default meter rule, so it kept `core-1` too.
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

0. **Power.** If its commander's power is ready, it activates it first, so the rest of
   the turn is played with it, a power that pays funds or cuts prices is in effect before
   it builds, and a defensive power holds through the opponent's turn.
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

**Commanders**: the AI reads ranges and capture speed through the engine
(`maxRangeOf`, `captureAmount`), so an enemy's longer-ranged artillery widens the threat
map and a capture its own commander finishes in one turn is scored as banked. Damage
forecasts use the engine's damage function, so firepower and defence modifiers on both
sides are counted. Production values each unit type with both commanders' firepower and
defence, and an indirect unit starts a larger share of its fights for each tile of range
its commander adds (`rangeInitiative`), so a commander with long guns builds them.

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
transport copters), join units, or save funds for a later build. It uses its power as
soon as the meter is full rather than timing it. Mirror matches on a
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
8. **Portraits**: commander `x` is drawn as `portrait.x`, a bust on a backdrop with its
   uniform, headgear and backdrop in team placeholders, so it takes its army's colours.
   The menus rasterise it into a canvas at the display's real resolution. A commander
   without a portrait is drawn as `portrait.unknown`, a silhouette. Faces use the skin and
   hair tones in the palette.
9. **Team colours**: the renderer's sprite cache takes one ramp per seat from the game's
   armies (section 9), so units and buildings are drawn in their commander's colours.
10. **Interface art**: the HUD, menus and dialogs draw sprites in the page with
    `SpriteSvg` (`apps/web/src/ui`), which writes a sprite's polygons as inline SVG: the
    same art as the map, sharp at any size, with team placeholders in a given army's
    colours, or in the text colour with `mono` (each polygon shaded by its lightness) for
    icons on coloured buttons. Interface icons are sprites too, `icon.<name>` under
    `svg/icon`, listed in `ui/icons.ts`; the capture flag uses team placeholders so it
    shows its owner. Units and terrain are shown by the same visual data the renderer
    uses (`ui/spriteArt.ts`), autotiled terrain by its east-west piece, so new content
    appears in menus and info cards as soon as it has art. Icons keep their own colours
    in both themes, since the colours carry their meaning; instead each is drawn over its
    silhouette stroked in the theme's `--icon-edge` colour (dark on light panels, a faint
    light rim on dark ones), so an icon that is mostly white or mostly grey still shows.
    Icons drawn `mono`, and unit and terrain art, have no edge.

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
  size. The viewport carries `insets`, the edges the HUD covers: a map that fits is
  centred in the rest of the view, a larger one can scroll its edges out from under the
  HUD, and the cursor is never scrolled beneath it.
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
- **Themes** (`ui/theme.ts`): a light and a dark theme. The toolbar switch steps
  through following the system, light and dark; the choice is kept in local storage
  and applied as `data-theme` on the root element before the first render. Every
  colour in `styles.css` is a token defined for both themes, with the accent split into
  its fill and its use as text, and army names as text blend the army's colour toward
  the text colour. The renderer draws the map's surroundings in the theme's colour.
- **Input**: mouse (click select/confirm, right-click cancel, drag pan, wheel zoom) and
  keyboard (arrows/WASD cursor, Enter/Space confirm, Esc cancel, E map menu, P power).
  During a computer turn the cursor still moves for inspection, but no orders are
  accepted.
- **Armies** (`session/armies.ts`): each side's name, colours, accent colour and portrait
  come from its commander. A commander with an army brings that army's name and colours;
  a seat led by the default commander, or by a commander another seat already leads,
  takes the first faction whose colours are free, starting from its own slot, so older
  games look as they did. Worked out once per game and cached.
- **New game**: a dialog picks the map and, for each side, whether a person or the
  computer plays it and which commander leads it. Each side shows its commander's
  portrait, army and colour; picking a side opens the roster of every commander and a
  briefing on the chosen one (bio, innate ability, power and its cost, and how fast each
  source fills the meter, all written by `describeCommander`). A commander leads one side
  at a time; the default Field Officer may lead several. It starts from the current
  game's choices when they fit, else you against the computer with a different
  commander per side.
- **Powers**: each side's row in the commanders card has its power meter filling in the
  army's colour; once the side to move's meter is full, it becomes a button named after
  the power (also P and the first item of the map menu) that activates it on a human
  turn. While it is active the meter shows the power's name. A banner with the
  commander's portrait announces every activation, the computer's included. The unit
  card shows Move and Range as the unit's commander changes them, green when raised and
  red when lowered, with the unit's own value beside them.
- **Layout**: the canvas fills the window and the HUD floats over it; clicks between its
  panels reach the map. Positions come from pure functions in `ui/hudLayout.ts`.
  - _Command bar_ (top): the commanders card, a hint for the current step, and icon
    buttons for zoom, save and load, and end turn. Its height is the board's top inset.
    The commanders card has the day and a row per side, the side to move highlighted:
    portrait, army and commander, funds and income, properties and units (`ui/sides.ts`),
    and the power meter. A defeated side stays listed, struck through.
  - _Info panel_ (a bottom corner): the unit under the cursor (or the unit being moved, at
    the end of its path) and the tile. HP is a ten-segment gauge, fuel a level bar with
    the next day's use hatched, and ammo one pip per round, each red when low. Defence is
    a shield row of star icons with what they are worth: on the tile card, the cut in
    damage to a unit at full HP; on the unit card, the cover it gets on that tile at its
    current HP (`ui/intel.ts`, one percent per star per HP pip, as in the damage formula).
    Properties add the owner and a capture gauge. The panel moves to the other corner
    when the cursor goes under it.
  - _Menus_ open beside their tile with an icon per order, unit art in the build menu,
    and a close button in the header. The _attack forecast_ is a bubble pointing at the
    target.
  - Below 900 px the hint and income are hidden; below 640 px the side names (kept for
    screen readers) and the end turn label are too.

## 10. Testing

Every package has a `test/` folder, run together by `pnpm test` (Vitest, node
environment). Engine tests run on small fixture rulesets so balance changes never
break a rule test; content, AI and web tests use the shipped content. Rendering and
React components are checked by hand.

[TESTING.md](TESTING.md) is the test coverage specification: each requirement, the
file that tests it, the phase it arrived in, and the manual checks.

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
   another sprite or change how high it flies. The build menu and info panel show the
   same art.

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

**A commander**

1. Append it to `commanders` in `packages/content/src/commanders.ts` (append only:
   players store commanders by index). Give it innate `modifiers`, a `power` with a
   `cost`, its own `modifiers` and any `effects`, and `charge` rates that favour what it
   does best (section 4.3). Modifiers name units with selectors, `direct` and `indirect`
   included.
2. Give it a profile in `commanderProfiles`: title, bio, innate ability name, and the army
   it leads with four team colours (light to deep) no other army uses.
3. Draw `packages/sprites/src/svg/portrait/<id>.svg` with team placeholders for the
   uniform. Until it exists the commander is shown as a silhouette.

It then appears in the new game roster with a briefing written from its data, the AI
uses its power, and its army is drawn in its colours, with no engine, renderer, UI or AI
change. The content tests check it has an innate ability and a power, a fast meter
source, an army and colours of its own, and (in `apps/web/test`) a portrait.

## 12. Phase 1 build order

1. Workspace scaffold, lint, tsconfig, CI scripts
2. Engine: types, ruleset compile, grid, RNG, pathfinding, with tests
3. Content: schemas, units, terrain, damage, ASCII converter, Twin Fords, with tests
4. Engine: all Phase 1 actions, turn cycle, win conditions, with tests
5. Sprites: palette, SVGs, atlas build, registry (replaced by runtime rasterising in phase 4)
6. Web: renderer, camera, input, session, menus, info panels, damage preview
7. Full hot-seat playthrough and the 30x20 performance check
