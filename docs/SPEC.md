# Project: Turn-based tactics game (Advance Wars 2 style) in React

## Goal
Build a working browser game that plays like Advance Wars 2: grid-based, turn-based
tactics with unit production, property capture, terrain effects, and a damage table.
Use original names, art, and faction identities (no Nintendo assets, sprites, names,
or audio). Mechanics should feel like AW2.

## Stack
- React + TypeScript + Vite
- 2D rendering on a single HTML canvas (Canvas 2D API) inside a React component.
  React renders menus, panels, and HUD as normal DOM on top of the canvas.
- Zustand for UI state only
- Vitest for engine tests
- pnpm workspace monorepo:
  - `packages/engine`: pure TypeScript game rules, zero React/DOM/canvas imports
  - `packages/content`: data: units, terrain, damage table, maps, commanders
  - `packages/sprites`: sprite sources, atlas build, sprite registry
  - `apps/web`: React app, renderer, input, menus

## Architecture rules (these make the later features possible)
1. The engine is a deterministic reducer: `applyAction(state, action) -> state`.
   All randomness (luck damage) comes from a seeded RNG stored in state.
2. Game state is plain serializable JSON. No class instances, no functions in state.
3. Every player input is an Action (`Move`, `Attack`, `Capture`, `Build`, `EndTurn`,
   ...). Keep an action log. Save/load, replays, undo, AI, and network play must all
   go through the same action pipeline.
4. All game content is data, not code: unit stats, movement types, terrain costs,
   defence stars, damage matrix, and build lists live in `packages/content` with
   schemas validated by zod. Adding a unit or terrain type must not require engine
   changes.
5. Movement types include `foot`, `mech`, `tread`, `tire`, `air`, `sea`, `lander`
   from day one, even though only land units ship in phase 1.
6. Players are abstracted behind a `PlayerController` interface (`local`, `ai`,
   `remote`) so couch play, AI, and P2P are just different controllers.
7. Commander effects are implemented as modifier hooks on the engine (attack,
   defence, movement, cost, power meter), with a default no-op commander.
8. The renderer is a pure function of game state plus transient animation state. It
   never mutates game state and the engine never knows it exists.

## Sprites (2D, low-poly look)
- Art style: flat-shaded, faceted "low poly" 2D. Each sprite is a handful of
  flat-colour polygons with 2-3 shades per surface, no outlines, no gradients, no
  textures. One shared palette for the whole game.
- Author every sprite as an SVG file in `packages/sprites/src` (polygons only), on a
  48x48 grid. A build script rasterises them into a single atlas PNG + JSON frame
  map at 1x and 2x.
- Team colour: sprites use a fixed set of placeholder colours that are recoloured
  per faction when the atlas is built (one atlas row per faction). Support 4 factions
  from the start.
- Everything is drawn through a sprite registry keyed by ID (`unit.tank`,
  `terrain.forest`, `building.city`, `ui.cursor`), so art can be replaced later
  without touching the renderer.
- Terrain autotiling: roads, rivers, bridges, and coastlines pick the right variant
  from their four neighbours. Implement this as a generic neighbour-mask lookup in
  the renderer, driven by data, so new terrain types can opt in.
- Phase 1 sprite list:
  - Terrain: plains, road (all connection variants), forest, mountain, sea, coast
    edges, bridge (horizontal and vertical)
  - Buildings: HQ, city, base (neutral + per faction)
  - Units, facing right, mirrored for left, 2-frame idle: infantry, mech, recon,
    tank, medium tank, APC, artillery, rockets, anti-air, missiles
  - UI: cursor, move-range tile, attack-range tile, path arrow pieces, HP digits,
    capture/low-fuel/low-ammo icons, "unit has moved" dimming
- Animations are simple tweens: slide along the path, attack bump, capture hop,
  destroy puff.
- Pixel-snap all drawing. Camera supports pan and integer zoom.

## Maps
- Versioned JSON map format: width, height, tile grid (terrain IDs), properties with
  owners, predeployed units, player slots, metadata.
- Also support the compact ASCII format below as an import format, with a legend
  defined in data. Write a converter (ASCII -> JSON) and use it for the first map.
- Maps load through a registry; any size must work. No hardcoded dimensions anywhere.

### First map: Spann Island (reference layout)
15 wide x 10 tall. Coordinates are 0-indexed, origin top-left, x to the right, y
down. Transcribe this exactly; do not redesign it.

```
       x: 0         1
          012345678901234
    y=0   ~~~~~~~~~~~~~~~
    y=1   ~~.F==B==.Fb.b~
    y=2   ~..F=F~.=C..hb~
    y=3   ~CC==~~~=.M.=b~
    y=4   ~..=.~~~=CMC=.~
    y=5   ~R==C~~F=====C~
    y=6   ~RH....FF.~~B~~
    y=7   ~~RR......~~..~
    y=8   ~~~~MCMFC.B.CC~
    y=9   ~~~~~~~~~~~~~~~
```

Legend:

| Char | Meaning                    |
|------|----------------------------|
| `~`  | Sea                        |
| `.`  | Plains                     |
| `=`  | Road                       |
| `F`  | Forest                     |
| `M`  | Mountain                   |
| `B`  | Bridge                     |
| `C`  | City, neutral              |
| `H`  | HQ, Player 1               |
| `R`  | Base (factory), Player 1   |
| `h`  | HQ, Player 2               |
| `b`  | Base (factory), Player 2   |

Property check (the converter's test must assert these):
- Player 1 (bottom-left): HQ at (2,6); bases at (1,5), (1,6), (2,7), (3,7)
- Player 2 (top-right): HQ at (12,2); bases at (11,1), (13,1), (13,2), (13,3)
- Neutral cities (11): (1,3), (2,3), (9,2), (9,4), (11,4), (4,5), (13,5), (5,8),
  (8,8), (12,8), (13,8)
- Totals: 21 properties, 65 sea, 29 plains, 20 road, 8 forest, 4 mountain, 3 bridge
- No predeployed units. Both players start with only their properties.

Notes:
- Bridges at (6,1), (12,6), and (10,8) span one sea tile each. (6,1) and (10,8)
  carry an east-west road; (12,6) carries a north-south road.
- The reference does not record shoals or reefs. Treat all `~` as sea, and render
  coast edges automatically where sea meets land.
- Starting funds 0, 1000 per property per day, Player 1 moves first.

## Phases
Work one phase at a time. At the end of each phase: tests pass, the app runs, and you
summarise what was built and wait for my go-ahead.

**Phase 0: Plan.** Before writing code, produce `docs/ARCHITECTURE.md` with the
state shape, action list, map schema, sprite pipeline, and folder layout. Wait for
approval.

**Phase 1: Playable core (2-player hot-seat on Spann Island).**
Movement with range and path preview, terrain costs, direct and indirect combat with
the damage formula and counterattacks, capture, production from bases, funds per
turn, repair and resupply on owned properties, fuel and ammo, APC transport and
supply, unit joining, win by HQ capture or rout, turn/day counter, unit and terrain
info panels, damage preview before confirming an attack. All phase 1 sprites done.

**Phase 2: Save/load.** Serialize state + action log to localStorage and to
exportable/importable JSON files. Versioned saves with migration.

**Phase 3: AI opponent.** A `PlayerController` that picks actions with a
heuristic (capture, favourable trades, build to counter).

**Phase 4: Naval and air units.** Ports, airports, landers, transports, subs with
dive, fuel burn per day and crashing, shoals and reefs. New sprites for each.

**Phase 5: Commanders.** Data-defined commanders with passive modifiers, power
meter, and powers, plus a selection screen and portraits in the same art style.

**Phase 6: Map editor.** Paint terrain, place properties and units, resize,
validate (each player has an HQ), import/export JSON and ASCII, playtest from the
editor.

**Phase 7: P2P multiplayer.** WebRTC data channels (PeerJS or similar), host
authoritative, exchanging Actions only. State hash check each turn to detect desync,
with reconnect via action-log replay.

**Later, design for but do not build:** fog of war, weather, campaign, 3-4 players.

## Quality bar
- Engine unit tests for movement ranges, the damage formula, capture, supply, win
  conditions, and a save -> load -> identical-state round trip.
- A map test that loads Spann Island and asserts the property check above.
- Strict TypeScript, no `any` in the engine.
- 60 fps on a 30x20 map on a mid-range laptop.
- Mouse and keyboard controls; layout usable down to tablet width.

Start with Phase 0.