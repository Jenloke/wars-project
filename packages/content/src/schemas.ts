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
    transport: z
      .object({ capacity: z.number().int().positive(), carries: z.array(id).min(1) })
      .optional(),
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

export const commanderSchema = z.object({
  id,
  name: z.string().min(1),
  modifiers: z.array(
    z.object({
      hook: z.enum(['attack', 'defence', 'movement', 'cost', 'powerGain']),
      units: z.array(id).optional(),
      value: z.number().int(),
    }),
  ),
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
