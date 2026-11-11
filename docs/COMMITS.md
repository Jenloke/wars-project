# Commit conventions

Every change lands as a small, single-purpose commit that says what changed, where,
and why. The format is [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
<type>(<scope>): <summary>

<body: why the change was needed, and anything a reviewer must know>

<footer: BREAKING CHANGE, save/ruleset version bumps, issue refs>
```

- **Summary**: imperative mood, lower case, no full stop, 72 characters or fewer.
  Write "add join action", not "added" or "adds".
- **Body**: optional for trivial changes, required when the reason is not obvious
  from the diff. Explain why, not what.
- One logical change per commit. If the summary needs "and", split the commit.

## Types

| Type | Use for |
|---|---|
| `feat` | A new player-visible or API-visible capability |
| `fix` | A bug fix |
| `perf` | A change whose only purpose is speed or memory |
| `refactor` | Restructuring with no behaviour change |
| `test` | Adding or correcting tests only |
| `content` | Data-only changes: unit stats, terrain, damage table, maps, commanders |
| `art` | Sprite SVGs, palette, atlas output |
| `docs` | Documentation only |
| `build` | Tooling, dependencies, workspace config, scripts |
| `chore` | Housekeeping that fits nothing above |

## Scopes

The scope is the package or area touched. Use exactly one; if a change needs two,
it is usually two commits (engine first, then the consumer).

| Scope | Path |
|---|---|
| `engine` | `packages/engine` |
| `content` | `packages/content` |
| `sprites` | `packages/sprites` |
| `web` | `apps/web` |
| `render` | `apps/web/src/render` |
| `ui` | `apps/web/src/ui`, `apps/web/src/input`, `apps/web/src/store` |
| `repo` | Root config, workspace, CI |
| `docs` | `docs/` |

## Rules that keep the history usable

1. **Engine changes carry their tests.** A `feat(engine)` or `fix(engine)` commit
   includes the test that proves it. A bug fix starts with a failing test.
2. **Balance changes are `content`, never `feat`.** Changing a number in the damage
   table or a unit cost is `content(content): ...`, so balance history can be read
   with `git log --grep "^content"`.
3. **Anything that changes game results is flagged.** If a commit changes what
   `applyAction` produces for an existing action log (formula, RNG use, rule order),
   add the footer `REPLAY-BREAKING: <what changed>`. Old replays and saves will
   diverge, so this needs a ruleset or save version bump.
4. **State shape changes are breaking.** Any change to `GameState`, `Action`, or the
   map JSON format uses `!` after the scope and a `BREAKING CHANGE:` footer, and
   bumps the matching version (`schemaVersion` or `formatVersion`) with a migration.
5. **Generated files go with their source.** Regenerated atlas output is committed in
   the same commit as the SVG or palette change that caused it.
6. **Each commit passes** `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Examples

```
feat(engine): add join action for damaged units of the same type

Excess HP above the cap is refunded as funds, proportional to unit cost.
```

```
fix(engine): reset capture progress when the capturing unit is destroyed

Progress previously survived the unit, so a second unit could finish a
capture it never started.
```

```
content(content): raise artillery cost from 6000 to 6500

Artillery was trading too well against tanks at equal funds.
```

```
perf(render): cache the terrain layer per map and owner array

Terrain was redrawn every frame. It now redraws only when the terrain or
owner array reference changes.
```

```
feat(engine)!: store capture points per tile instead of per unit

BREAKING CHANGE: GameState.capture added, Unit.captureProgress removed.
schemaVersion 1 -> 2, migration added in saves/migrations.ts.
REPLAY-BREAKING: none, results are identical.
```

```
art(sprites): redraw medium tank turret and rebuild the atlas
```

## Branches and phases

- Branch per unit of work: `<type>/<scope>-<short-name>`, for example
  `feat/engine-transport` or `fix/render-coast-mask`.
- Each spec phase ends with a tag: `phase-1`, `phase-2`, and so on. The tagged commit
  is the one where tests pass and the app runs.
- Merge with squash only when the branch commits are noise. Otherwise keep the
  commits, since the per-rule history is what makes regressions traceable.
