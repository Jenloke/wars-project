import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'IDs are camelCase identifiers');
const count = z.number().int().nonnegative();
const percent = z.number().int().min(1).max(200);

export const unitSchema = z
  .object({
    id,
    name: z.string().min(1),
    moveType: id,
    movePoints: z.number().int().min(1).max(15),
    cost: z.number().int().positive(),
    maxFuel: z.number().int().positive(),
    maxAmmo: count,
    minRange: count,
    maxRange: count,
    canCapture: z.boolean(),
    canSupply: z.boolean(),
    tags: z.array(id).optional(),
    transport: z
      .object({ capacity: z.number().int().positive(), carries: z.array(id).min(1) })
      .optional(),
    fuelPerDay: count.optional(),
    lostWithoutFuel: z.boolean().optional(),
    ignoresTerrainDefence: z.boolean().optional(),
    dive: z.object({ fuelPerDay: count, attackableBy: z.array(id).min(1) }).optional(),
  })
  .refine((unit) => unit.minRange <= unit.maxRange, 'minRange must not exceed maxRange')
  .refine(
    (unit) => (unit.maxRange === 0) === (unit.minRange === 0),
    'Unarmed units have minRange and maxRange 0',
  );

export const terrainSchema = z.object({
  id,
  name: z.string().min(1),
  defence: z.number().int().min(0).max(4),
  moveCosts: z.record(id, z.number().int().min(1).max(15)),
  property: z.object({ isHq: z.boolean(), repairs: z.array(id), builds: z.array(id) }).optional(),
});

export const damageEntrySchema = z.object({
  attacker: id,
  defender: id,
  primary: percent.optional(),
  secondary: percent.optional(),
});

const modifierSchema = z.object({
  hook: z.enum([
    'attack',
    'defence',
    'movement',
    'cost',
    'range',
    'capture',
    'repair',
    'regen',
    'income',
  ]),
  units: z.array(id).min(1).optional(),
  value: z.number().int(),
});

const powerEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('heal'),
    hp: z.number().int().positive(),
    units: z.array(id).min(1).optional(),
  }),
  z.object({ kind: z.literal('resupply'), units: z.array(id).min(1).optional() }),
  z.object({ kind: z.literal('funds'), incomePercent: z.number().int().positive() }),
]);

export const commanderSchema = z.object({
  id,
  name: z.string().min(1),
  modifiers: z.array(modifierSchema),
  charge: z
    .object({
      damageDealt: count,
      damageTaken: count,
      kills: count,
      captures: count,
      income: count,
    })
    .optional(),
  power: z
    .object({
      name: z.string().min(1),
      cost: z.number().int().positive(),
      modifiers: z.array(modifierSchema),
      effects: z.array(powerEffectSchema).optional(),
    })
    .optional(),
});

export const rulesetSchema = z.object({
  id: z.string().min(1),
  moveTypes: z.array(id).min(1),
  units: z.array(unitSchema).min(1),
  terrain: z.array(terrainSchema).min(1),
  damage: z.array(damageEntrySchema),
  commanders: z.array(commanderSchema).min(1),
  rules: z.object({
    maxHp: z.number().int().positive(),
    hpPerPip: z.number().int().positive(),
    capturePoints: z.number().int().positive(),
    repairHp: z.number().int().positive(),
    luckMax: count,
  }),
});

const coordinate = z.number().int().nonnegative();

export const mapSchema = z
  .object({
    formatVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    author: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tiles: z.array(id),
    properties: z.array(
      z.object({ x: coordinate, y: coordinate, owner: z.number().int().min(0).nullable() }),
    ),
    units: z.array(
      z.object({
        x: coordinate,
        y: coordinate,
        type: id,
        owner: z.number().int().min(0),
        hp: z.number().int().positive().optional(),
      }),
    ),
    players: z
      .array(z.object({ slot: z.number().int().min(0), startingFunds: count }))
      .min(2)
      .max(4),
    rules: z.object({ incomePerProperty: count }),
  })
  .refine((map) => map.tiles.length === map.width * map.height, 'tiles must be width * height')
  .refine(
    (map) => map.properties.every((p) => p.x < map.width && p.y < map.height),
    'A property lies outside the map',
  )
  .refine(
    (map) => map.units.every((u) => u.x < map.width && u.y < map.height),
    'A unit lies outside the map',
  );
