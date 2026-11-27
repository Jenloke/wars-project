# Test coverage specification

This document says what the automated test suite must cover, where each requirement
is tested, and what is checked by hand instead. It applies to every phase: a phase is
not finished until its requirements are listed here and their tests pass.

Status: **Phases 1 to 5, and the compact HUD that precedes phase 6.** 289 tests in 35
files, all passing.
Architecture is in [ARCHITECTURE.md](ARCHITECTURE.md), commit rules in
[COMMITS.md](COMMITS.md) and the product spec in [SPEC.md](SPEC.md).

Line coverage is not measured; no coverage provider is installed. The requirement
tables in section 4 are the reference for what is covered.

## 1. Running the tests

| Command                                            | What it does                                   |
| -------------------------------------------------- | ---------------------------------------------- |
| `pnpm test`                                        | Runs every test in every package once (Vitest) |
| `npx vitest run packages/engine`                   | Runs one package's tests                       |
| `npx vitest run packages/engine/test/fuel.test.ts` | Runs one file                                  |
| `npx vitest run -t "dive"`                         | Runs tests whose name matches                  |
| `npx vitest`                                       | Watch mode                                     |

Configuration is the root `vitest.config.ts`. It collects
`packages/*/test/**/*.test.ts` and `apps/*/test/**/*.test.ts` and runs them in the
`node` environment, so there is no DOM or canvas during tests.

Every commit must pass `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
`pnpm test` (COMMITS.md). Test files are type-checked with their package.

## 2. Principles

1. **Engine tests use small fixture rulesets, not the shipped content.** A balance
   change in `packages/content` never breaks a rule test, and the tests prove the
   rules work for any data, not just ours. Fixture units have their own IDs (`sub`,
   `carrier`, `destroyer`) so nothing leans on content names.
2. **Content, AI and web tests use the shipped content.** Content tests are the
   checks on our data. The AI is judged on the game it will actually play.
3. **Everything is deterministic.** Tests fix their seeds and never depend on the
   clock or `Math.random`, except the performance budgets. The AI is tested never
   to read the luck seed.
4. **Engine changes carry their tests.** A `feat(engine)` or `fix(engine)` commit
   includes the test that proves it, and a bug fix starts with a failing test. AI
   fixes follow the same rule: the new test must fail with the fix reverted.
5. **Names state behaviour.** `describe` names the area and `it` reads as a
   sentence about what happens: "crashes an aircraft whose tank empties".
6. **No snapshot files.** Expected values are written in the test, so a change
   shows up as a readable diff and has to be made on purpose.
7. **Logic stays out of components and canvas code.** Anything that can be a plain
   function (camera maths, the fuel loss list) lives in a `.ts` module with a test.
   What is left in React components and the renderer is checked by hand (section 6).
8. **Long tests set their own limits.** Performance tests assert a time budget.
   The 60-day AI game sets a 30 s timeout so a busy machine does not fail it.

## 3. Layout and fixtures

| Package            | Tests in         | Fixtures                                                                                                                                                                                                                                                                                                                |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`  | `test/*.test.ts` | `fixtures.ts`: a land-only `testRuleset`, an ASCII legend for test maps, `makeMap`, `makeGame`, `apply`/`reject`, `withUnit`, a scripted game for save tests, `deepFreeze`. `navalFixtures.ts`: `navalRuleset` with air, sea and lander move types, six naval and air units, and shoal, reef, port and airport terrain. |
| `packages/content` | `test/*.test.ts` | `fixtures/save-v1.json`: a real save written by the phase 3 build, kept to prove old saves still load through every migration since.                                                                                                                                                                                    |
| `packages/sprites` | `test/*.test.ts` | Inline SVG strings.                                                                                                                                                                                                                                                                                                     |
| `packages/ai`      | `test/*.test.ts` | `fixtures.ts`: the shipped ruleset, `makeGame` from ASCII rows (plus `c`/`d` for owned cities), `destination` of an action, `unitAt`.                                                                                                                                                                                   |
| `apps/web`         | `test/*.test.ts` | In-memory storage and fake controllers inside each test.                                                                                                                                                                                                                                                                |

Test-map legend characters for the engine fixtures include `:` shoal, `*` reef,
`A`/`a` airports and `P`/`p` ports, alongside the land terrain from phase 1.

## 4. Coverage requirements

Each row is a requirement, the file that tests it, and the phase it arrived in.
A requirement with no automated test is listed in section 6 instead.

### 4.1 Engine (`packages/engine/test`)

**Movement** (`movement.test.ts`)

| Requirement                                                                    | Phase |
| ------------------------------------------------------------------------------ | ----- |
| Range is a diamond of radius = move points on open ground                      | 1     |
| Terrain costs apply per move type; impassable terrain stops movement           | 1     |
| Infantry climbs mountains at cost 2; the cheaper way round is taken            | 1     |
| Range is limited by remaining fuel                                             | 1     |
| Enemy units block; friendly units can be passed through but not stopped on     | 1     |
| The cheapest path is reconstructed                                             | 1     |
| Move spends fuel and marks the unit moved; illegal paths and units are refused | 1     |

**Combat** (`combat.test.ts`)

| Requirement                                                                                          | Phase |
| ---------------------------------------------------------------------------------------------------- | ----- |
| The damage formula matches hand-computed values                                                      | 1     |
| Damage and counterattack fall inside the preview range                                               | 1     |
| Luck is deterministic for a seed and varies across seeds                                             | 1     |
| The defender's terrain defence applies                                                               | 1     |
| Aircraft get no cover from the terrain below them                                                    | 4     |
| Primary weapons spend ammo; out of ammo, the secondary weapon is used                                | 1     |
| A unit destroyed in combat is reported with cause `combat`                                           | 4     |
| Own units, out-of-range targets and empty tiles are refused                                          | 1     |
| Indirect fire is never countered, cannot hit adjacent units or fire after moving, and cannot counter | 1     |
| Commander attack, movement and cost modifiers apply from data                                        | 1     |

**Capture** (`capture.test.ts`)

| Requirement                                                       | Phase |
| ----------------------------------------------------------------- | ----- |
| A full-strength unit takes two turns; progress is by displayed HP | 1     |
| Progress resets when the capturer leaves or is destroyed          | 1     |
| Units that cannot capture, and owned properties, are refused      | 1     |
| Capturing an HQ wins                                              | 1     |

**Repair, supply, join, transport and build** (`logistics.test.ts`, `landers.test.ts`)

| Requirement                                                                                                                    | Phase |
| ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Owned properties heal 20 HP at a proportional cost, refill fuel and ammo, only what the player can afford, never above full HP | 1     |
| Properties the player does not own do nothing                                                                                  | 1     |
| APCs resupply neighbours with Supply and at the start of the turn; other units cannot                                          | 1     |
| Join merges HP, fuel and ammo and refunds excess; full-HP targets and other types are refused                                  | 1     |
| Transports load, carry and unload next to themselves; bad cargo and drop tiles are refused                                     | 1     |
| Cargo is chosen by unit ID, move type or tag                                                                                   | 4     |
| A cargo rule that matches no unit fails when the ruleset compiles                                                              | 4     |
| Cargo is lost with its transport                                                                                               | 1     |
| Landers load and unload only from a shoal or port                                                                              | 4     |
| Build creates a unit that waits a turn and charges funds; options list affordability; illegal builds are refused               | 1     |

**Fuel** (`fuel.test.ts`)

| Requirement                                                                                | Phase |
| ------------------------------------------------------------------------------------------ | ----- |
| Daily fuel burns at the start of the owner's turn only; ground units burn none             | 4     |
| Units carried in a transport burn no fuel                                                  | 4     |
| An aircraft whose tank empties crashes, reported with cause `fuel`                         | 4     |
| A player whose last unit crashes is routed                                                 | 4     |
| A unit on an owned airport or beside a supply unit is refuelled before the tank is checked | 4     |
| A unit that burns fuel but is not lost on empty stays at 0 fuel                            | 4     |
| A ship that sinks takes its cargo with it                                                  | 4     |

**Dive** (`dive.test.ts`)

| Requirement                                                                      | Phase |
| -------------------------------------------------------------------------------- | ----- |
| Unit options offer Dive after moving and Surface once dived                      | 4     |
| Diving twice, surfacing on the surface and diving a unit that cannot are refused | 4     |
| Only the units the dive rule names can target or counter a dived unit            | 4     |
| A dived unit can attack                                                          | 4     |
| A dived unit burns its dived fuel rate                                           | 4     |
| Joining keeps the dive state of the unit joined into                             | 4     |

**Commanders** (`commanders.test.ts`, `power.test.ts`, `meter.test.ts`)

Each test adds a commander, `test`, to the fixture ruleset, so the rules are proved on
data rather than on the shipped commanders.

| Requirement                                                                                                                                    | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Range modifiers stretch indirect fire so it can hit what was out of reach, leave direct units alone, and never shorten below the minimum range | 5     |
| Capture modifiers scale capture by displayed HP, can capture in one turn, round down, and always remove at least one point                     | 5     |
| Income modifiers scale what each property pays, from the opening funds on                                                                      | 5     |
| Repair modifiers repair more HP on owned properties at the usual price per HP                                                                  | 5     |
| Regeneration heals the owner's units for free at the start of their turn, anywhere, carried units too, never above full or below 1 HP          | 5     |
| Modifiers name units by ID, move type, tag or the `direct` and `indirect` classes; a selector that matches no unit fails to compile            | 5     |
| Firepower and defence modifiers apply in the damage formula; movement never drops below zero                                                   | 5     |
| Activating a power is refused without a power, before the meter is full and while it is active                                                 | 5     |
| A power spends the meter and adds its modifiers to the innate ones, from activation until its owner's next turn starts                         | 5     |
| Power effects heal and resupply the units they name, for free, and pay a share of a day's income counting the power's own modifiers            | 5     |
| Power definitions need a positive cost and selectors that name units                                                                           | 5     |
| A game with an active power saves and replays exactly                                                                                          | 5     |
| The meter fills by default as in phases 1 to 4: all of the damage taken, half of what is dealt                                                 | 5     |
| Each commander's rates charge damage dealt and taken, kills, captures (not progress) and income collected each turn                            | 5     |
| The meter holds no more than the power costs, stops while the power is active, and resumes when it ends; negative rates are refused            | 5     |

**Turns, win, determinism** (`game.test.ts`)

| Requirement                                                                                                  | Phase |
| ------------------------------------------------------------------------------------------------------------ | ----- |
| Players alternate, days count, income is paid and units refresh                                              | 1     |
| A player who loses their last unit is routed; one who has not built yet is not                               | 1     |
| Resigning ends the game                                                                                      | 1     |
| The same seed and log give the same state hash; a different seed differs                                     | 1     |
| A save and load mid-game round-trips                                                                         | 1     |
| The reducer never mutates its input, leaves state untouched on a refused action, and shares untouched arrays | 1     |

**Saves and migrations** (`save.test.ts`, `migrations.test.ts`)

| Requirement                                                                                                                                                       | Phase |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Save → JSON → load gives an identical state, mid-game, new and finished                                                                                           | 2     |
| A loaded game continues exactly as the original would have                                                                                                        | 2     |
| A naval game with a dived unit and a fuel loss round-trips                                                                                                        | 4     |
| Saves are stamped with format, version, ruleset and time                                                                                                          | 2     |
| Edited state, truncated logs, other rulesets and unloadable maps are refused; the first illegal action is named                                                   | 2     |
| Migrations: current saves unchanged, steps applied in order, newer and unknown versions refused, non-saves refused, a step that forgets to bump the version fails | 2     |
| Format 1 → 2 gives every unit `dived: false` in key order                                                                                                         | 4     |
| Format 2 → 3 gives every player `powerActive: false`, last in key order                                                                                           | 5     |
| Every version below the current one has an upgrade step                                                                                                           | 2     |

**Performance** (`perf.test.ts`, 30 × 20 map)

| Requirement                                 | Phase |
| ------------------------------------------- | ----- |
| 5000 movement range queries in under 500 ms | 1     |
| 4000 move actions applied in under 1500 ms  | 1     |

### 4.2 Content (`packages/content/test`)

**Ruleset** (`content.test.ts`)

| Requirement                                                                                                                                             | Phase |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Content passes the zod schemas and compiles with no dangling references                                                                                 | 1     |
| Every armed unit has a target and every unit can be hit                                                                                                 | 1     |
| Every armed ground unit except missiles can hit every other ground unit                                                                                 | 4     |
| Bases build ground units, ports ships and airports aircraft                                                                                             | 4     |
| Cruisers carry copters but not planes; landers carry any ground unit                                                                                    | 4     |
| Aircraft get no terrain cover and all burn fuel                                                                                                         | 4     |
| Only cruisers and submarines can reach a dived submarine                                                                                                | 4     |
| A property only builds units that can stand on it                                                                                                       | 4     |
| Ports repair ships, airports aircraft, cities ground units                                                                                              | 4     |
| Only units that carry ammo have primary weapons                                                                                                         | 1     |
| Every core-1 land matchup keeps the value it shipped with                                                                                               | 4     |
| Aircraft cross every terrain at cost 1; reefs cost ships 2 and give one star; shoals take ground units and landers but not other ships; ports take both | 4     |
| Terrain, buildings and units are drawn by naming convention unless a visual overrides it                                                                | 4     |

**Commanders** (`commanders.test.ts`)

| Requirement                                                                                                                    | Phase |
| ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Descriptions are written from the data: every innate modifier, the power's effects then modifiers, and a pace per meter source | 5     |
| The default commander has nothing to describe; unknown commanders are refused                                                  | 5     |
| A described commander passes the content schema and compiles in the engine                                                     | 5     |
| The default commander has a profile with no army of its own; a commander with no profile gets a plain one                      | 5     |
| At least five shipped commanders, each with an innate ability and one power                                                    | 5     |
| Each leads with a different mechanic, together covering firepower, defence, economy, regeneration, range and capture           | 5     |
| Each charges fastest from what it does best                                                                                    | 5     |
| Each leads an army with a name and colours of its own, light to deep                                                           | 5     |

**Maps** (`content.test.ts`)

| Requirement                                                                                                                                                                      | Phase |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The ASCII converter turns rows into tiles and properties, at any size                                                                                                            | 1     |
| It reads shoals, reefs, ports and airports with their owners                                                                                                                     | 4     |
| Ragged rows and unknown characters are reported with the row number                                                                                                              | 1     |
| Maps need exactly one HQ per player; malformed JSON maps are refused                                                                                                             | 1     |
| Twin Fords: registered, 16 × 10, players, neutral cities and terrain totals as documented, rotationally symmetric, empty start                                                   | 1     |
| Tern Reach: registered, 20 × 14, an HQ, two bases, a port and an airport per player, two neutral airports and ten neutral cities, terrain totals, symmetric, ports on open water | 4     |

**Save files** (`saves.test.ts`)

| Requirement                                                                                                       | Phase   |
| ----------------------------------------------------------------------------------------------------------------- | ------- |
| A saved Twin Fords game loads to an identical state                                                               | 2       |
| A format 1 save written by the phase 3 build still loads, with its meters at the values it was saved with         | 4, 5    |
| Non-saves, damaged fields (named), invalid maps, newer builds, other rules and tampered logs are refused          | 2       |
| The action schema accepts every action type, Dive, Surface and ActivatePower included, and refuses malformed ones | 2, 4, 5 |

### 4.3 Sprites (`packages/sprites/test/sprites.test.ts`)

| Requirement                                                                                                | Phase |
| ---------------------------------------------------------------------------------------------------------- | ----- |
| Every shipped SVG passes the art rules and loads at startup                                                | 4     |
| Units have two idle frames and team colours                                                                | 4     |
| The parser reads polygons, fills and team placeholders, and enforces the art rules                         | 4     |
| Sprite IDs and frames come from file paths; gaps in frame numbers are refused                              | 4     |
| `resolve` returns the first sprite that has art; sprites can be added at runtime                           | 4     |
| The rasterizer fills exactly the pixels whose centres are inside, at any size                              | 4     |
| Later polygons paint over earlier ones; team colours are recoloured and shading covers every painted pixel | 4     |

### 4.4 Computer opponent (`packages/ai/test`)

| Requirement                                                                                                                                    | File                 | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| Terrain distances charge each tile entered, differ toward and away, mark cut-off tiles, take the nearest goal; range rings clip at the edge    | `distance.test.ts`   | 3     |
| The threat map covers direct reach and indirect range bands, records enemy capturers, ignores defeated players                                 | `board.test.ts`      | 3     |
| Danger is the expected loss in range, discounted for costly attackers, lower on better terrain                                                 | `board.test.ts`      | 3     |
| Attack forecasts average luck and predict the counter; certain kills; no weapon gives null                                                     | `tactics.test.ts`    | 3     |
| Kills first, no losing trades, indirect units fire from where they stand, stop an HQ capture first                                             | `tactics.test.ts`    | 3     |
| Captures in reach, finish captures in progress, take the enemy HQ over an attack                                                               | `tactics.test.ts`    | 3     |
| Retreat to repair, artillery spacing, guard the HQ, repair on a base that could build, step off a blocked base, head for the assigned property | `movement.test.ts`   | 3     |
| The capture plan gives near properties to near units, leaves badly damaged capturers out, skips occupied properties                            | `movement.test.ts`   | 3     |
| Builds capturers early, counters tanks and infantry, spends idle funds, splits funds between bases, builds nothing without a base or money     | `production.test.ts` | 3     |
| Expects only units the properties on the map can build                                                                                         | `production.test.ts` | 4     |
| Builds no ships in a harbour that cannot reach the enemy; builds a battleship that can shell it                                                | `production.test.ts` | 4     |
| Dives a sub an enemy could hit, surfaces when nothing can, surfaces to get home                                                                | `naval.test.ts`      | 4     |
| Aircraft are not drawn to cover they do not get                                                                                                | `naval.test.ts`      | 4     |
| Turns aircraft home in time, presses on with fuel to spare, never flies past the point of return                                               | `naval.test.ts`      | 4     |
| Clears an airport a damaged aircraft needs                                                                                                     | `naval.test.ts`      | 4     |
| Plays Twin Fords against itself legally and deterministically                                                                                  | `game.test.ts`       | 3     |
| Plays 60 days of Tern Reach, builds aircraft and loses none to fuel                                                                            | `game.test.ts`       | 4     |
| Never reads the luck seed; only ends the turn once the game is over                                                                            | `game.test.ts`       | 3     |
| Reads enemy indirect fire at the range their commander gives it; banks a capture its commander finishes in one turn                            | `commanders.test.ts` | 5     |
| Activates its power as soon as the meter is full, and never without a power                                                                    | `commanders.test.ts` | 5     |
| Values what it builds by its commander's range and firepower                                                                                   | `commanders.test.ts` | 5     |
| Plays fifteen days with every commander, each side using its power                                                                             | `commanders.test.ts` | 5     |
| A turn with 20 units a side on 30 × 20 takes under 2 s                                                                                         | `game.test.ts`       | 3     |

### 4.5 Web app (`apps/web/test`)

| Requirement                                                                                                                                                                        | File                  | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----- |
| Save slots are written, listed, read and removed; the index survives restarts and is rebuilt when missing; vanished saves drop out; full storage is reported and the old save kept | `saveStore.test.ts`   | 2     |
| Save summaries describe finished games and tolerate junk                                                                                                                           | `saveStore.test.ts`   | 2     |
| Computer turns follow local ones; local input is ignored meanwhile; computer moves save and replay exactly; a computer seat resumes on load                                        | `gameSession.test.ts` | 3     |
| The AI controller waits for the board and ends the turn after a refused move                                                                                                       | `gameSession.test.ts` | 3     |
| Every unit and terrain in the shipped content has its own art; placeholders and renderer markers exist                                                                             | `visuals.test.ts`     | 4     |
| Tiles are whole device pixels at any display scaling; the tile under a point is found at fractional scaling                                                                        | `camera.test.ts`      | 4     |
| The turn banner names units lost to fuel and no others                                                                                                                             | `fuelLosses.test.ts`  | 4     |
| Sides take their commander's army name and colours; default commanders keep their faction; sides that share colours are kept apart                                                 | `armies.test.ts`      | 5     |
| New games put each side's chosen commander in the setup                                                                                                                            | `gameSession.test.ts` | 5     |
| Save summaries name each side's commander and keep them through the index                                                                                                          | `saveStore.test.ts`   | 5     |
| Every commander has a team-coloured portrait, and the silhouette exists                                                                                                            | `visuals.test.ts`     | 5     |
| Every interface icon has art and the capture flag takes team colours; units and terrain show their own art in menus and info cards, autotiled terrain by a sample piece            | `hudArt.test.ts`      | HUD   |
| Content without art is shown in the interface by placeholder art                                                                                                                   | `hudArt.test.ts`      | HUD   |
| A map that fits is centred below the HUD; a larger one scrolls its edges clear of it; the cursor is scrolled out from under it                                                     | `camera.test.ts`      | HUD   |
| Tiles are placed on the board at any display scaling; the info panel moves corners only when the cursor goes under it; the forecast bubble sits above its target, or below it      | `hudLayout.test.ts`   | HUD   |
| The info panel describes the unit under the cursor, or the unit being moved at the end of its path                                                                                 | `intel.test.ts`       | HUD   |

## 5. The spec's quality bar

| SPEC.md requirement                   | Covered by                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Engine tests for movement ranges      | `engine/test/movement.test.ts`                                                                         |
| The damage formula                    | `engine/test/combat.test.ts`, "matches hand-computed values"                                           |
| Capture                               | `engine/test/capture.test.ts`                                                                          |
| Supply                                | `engine/test/logistics.test.ts`                                                                        |
| Win conditions                        | `engine/test/game.test.ts`, `capture.test.ts`, `fuel.test.ts` (rout by fuel)                           |
| Save → load → identical state         | `engine/test/save.test.ts`, `game.test.ts`, `content/test/saves.test.ts`                               |
| Map test asserting the property check | `content/test/content.test.ts` for Twin Fords, which replaces Spann Island (ARCHITECTURE.md section 0) |
| No `any` in the engine                | Not a test: strict TypeScript and the ESLint rule `@typescript-eslint/no-explicit-any`                 |
| 60 fps on a 30 × 20 map               | The engine budgets in `perf.test.ts` are a proxy; frame rate is checked by hand                        |

## 6. Checked by hand

These parts need a canvas or a DOM, which the node test run does not have. They are
checked in the running app (`pnpm dev`) before a phase is handed over, at 100% and at
a fractional display scale such as 125% or 150%.

| Area          | Code                                                   | Checks                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Map drawing   | `render/renderer.ts`, `render/terrainLayer.ts`         | Terrain, roads, bridges and coasts autotile; properties in owner colours; sprites sharp at every zoom level and display scale; no gaps between tiles.                                                                                |
| Units         | `render/renderer.ts`, `render/spriteCache.ts`          | Team colours; two-frame idle; dimmed after acting; HP digits and low fuel, low ammo and capture icons; aircraft drawn raised with a shadow; dived units see-through with the submerged overlay; transports show their cargo marker.  |
| Animation     | `render/playback.ts`                                   | Slide along the path, attack bump, capture hop, destroy puff, including a crash from fuel.                                                                                                                                           |
| Orders        | `input/interaction.ts`, `ui/Menus.tsx`                 | Each order appears only when legal, with its icon: Attack, Capture, Supply, Dive, Surface, Join, Load, Unload (with the cargo's art), Wait. Range and path previews; the forecast bubble points at the target before attacking.      |
| Panels        | `ui/IntelPanel.tsx`                                    | Unit fuel's tooltip gives the daily rate (dived rate while dived); aircraft show "No cover"; badges show Dived and acted; low HP, fuel and ammo are red; cargo is shown by its art.                                                  |
| Turn banner   | `ui/Overlays.tsx`                                      | Day, army and computer marker; "Out of fuel" lists the units lost as the turn began.                                                                                                                                                 |
| Build menus   | `ui/Menus.tsx`                                         | Bases, ports and airports list the units they build, with costs and affordability.                                                                                                                                                   |
| Saves         | `saves/*`, `ui/GameDialog.tsx`                         | Autosave resumes after a reload; export and import of a file; a full storage message.                                                                                                                                                |
| Computer seat | `session/aiController.ts`                              | The computer plays a full turn at a watchable pace and hands back.                                                                                                                                                                   |
| Commanders    | `ui/NewGameDialog.tsx`, `ui/CommanderDetails.tsx`      | Each side shows its commander's portrait, army and colour; the roster greys out a commander another side leads; the briefing matches the commander; Start begins the game with them.                                                 |
| Powers        | `ui/CommandBar.tsx`, `ui/Menus.tsx`, `ui/Overlays.tsx` | The meter fills in the army's colour and glows when full; the power button, P and the map menu activate it; the banner shows for either side; the meter shows the power's name while active.                                         |
| Army colours  | `render/spriteCache.ts`, `session/armies.ts`           | Units and buildings are drawn in their commander's colours; an older save keeps its faction colours.                                                                                                                                 |
| Layout        | `ui/*`, `styles.css`                                   | Mouse and keyboard controls; usable down to tablet width. The HUD floats over the map and clicks between its panels reach the map; the cursor never ends up under the command bar; the info panel moves corners to stay clear of it. |
| Icons         | `ui/SpriteSvg.tsx`, `svg/icon/*`                       | Icons and unit thumbnails are sharp at every display scale; icons on the gold buttons follow the text colour.                                                                                                                        |

## 7. Adding content

ARCHITECTURE.md section 11 explains how to add a unit, a unit-producing building
or terrain without code changes. The existing tests then check the new content
with no edits:

- the ruleset compiles, with every reference and cargo or dive selector matching;
- every armed unit has a target and the new unit can be hit;
- units with primary weapons carry ammo;
- each property only builds units that can stand on it;
- every unit and terrain has its own art. A new unit without art fails here; the
  game would draw a placeholder, but shipped content must have real art;
- every commander has an innate ability, a power, a meter source it charges fast from,
  an army and colours of its own, a description, and a portrait;
- every sprite passes the art rules.

What a contributor adds:

- a map test for a new map, in the style of Twin Fords and Tern Reach: size,
  players, property positions, terrain totals, symmetry;
- an entry in a rule test only if the content needs a new kind of rule. A new
  field on units or terrain is an engine change and carries engine tests;
- a new pinned-values test, and a new ruleset ID, if existing matchups change,
  because saves are verified by replaying under the ruleset they name.

## 8. Known gaps

- Rendering, React components and input handling have no automated tests
  (section 6).
- `SpriteCache` reuse across zoom and resize is checked only by hand.
- The AI never uses transports, so there are no tests for it loading or
  unloading units. Landers and transport copters are tested in the engine.
- Hiding dived units from the opponent waits for fog of war, so it has no test.
- Commander balance is measured by having the computer play every pairing, which is
  not a test: it changes with the AI. The AI uses its power as soon as the meter is full
  and does not time it.
- Line coverage is not measured.

## 9. Keeping this document current

- Each phase adds its requirements here in the same branch as the tests.
- When a test is added, removed or renamed, update its row.
- Test-only commits use the `test` type with the scope of the code under test,
  for example `test(engine)` or `test(render)`.
