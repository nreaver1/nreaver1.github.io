import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { courses } from '../db/schema';
import type { Db } from '../db/types';
import { parseInput } from '../validation';

export const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
/** "Within 2 hrs" ≈ 120 straight-line miles until a drive-time API is added (SPEC §8). */
export const NEAR_RADIUS_MILES = 120;
const METERS_PER_MILE = 1609.344;

export type CourseResult = {
  id: string;
  name: string;
  address: string | null;
  city: string;
  region: string;
  timezone: string;
  distanceMiles: number;
  /** Rough drive estimate; see `estimateDriveMinutes`. */
  driveMinutes: number;
};

export const CourseSearchInput = z.object({
  query: z.string().trim().max(80).default(''),
  scope: z.enum(['near', 'all']).default('near'),
  lat: z.coerce.number().min(-90).max(90).default(BALTIMORE.lat),
  lng: z.coerce.number().min(-180).max(180).default(BALTIMORE.lng),
  radiusMiles: z.coerce.number().min(1).max(500).default(NEAR_RADIUS_MILES),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type CourseSearch = z.input<typeof CourseSearchInput>;

/** Where courses come from. Seeded catalog today; a licensed national dataset later (SPEC §8). */
export interface CourseProvider {
  search(input: CourseSearch): Promise<CourseResult[]>;
  getById(id: string): Promise<CourseResult | null>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class SeedProvider implements CourseProvider {
  constructor(private readonly db: Db) {}

  async search(raw: CourseSearch): Promise<CourseResult[]> {
    const input = parseInput(CourseSearchInput, raw);
    const origin = sql`st_setsrid(st_makepoint(${input.lng}, ${input.lat}), 4326)::geography`;
    const miles = sql<number>`st_distance(${courses.geog}, ${origin}) / ${METERS_PER_MILE}`;
    const where: SQL[] = [eq(courses.isPublic, true)];
    if (input.scope === 'near') {
      where.push(sql`st_dwithin(${courses.geog}, ${origin}, ${input.radiusMiles * METERS_PER_MILE})`);
    }
    const order: SQL[] = [];
    if (input.query) {
      const like = `%${escapeLike(input.query)}%`;
      where.push(
        sql`(${courses.name} ilike ${like} or ${courses.city} ilike ${like} or similarity(${courses.name}, ${input.query}) > 0.3)`,
      );
      order.push(desc(sql`similarity(${courses.name}, ${input.query})`));
    }
    order.push(asc(miles));

    const rows = await this.db
      .select({
        id: courses.id,
        name: courses.name,
        address: courses.address,
        city: courses.city,
        region: courses.region,
        timezone: courses.timezone,
        distanceMiles: miles,
      })
      .from(courses)
      .where(and(...where))
      .orderBy(...order)
      .limit(input.limit);
    return rows.map(withDrive);
  }

  async getById(id: string): Promise<CourseResult | null> {
    if (!z.uuid().safeParse(id).success) return null;
    const origin = sql`st_setsrid(st_makepoint(${BALTIMORE.lng}, ${BALTIMORE.lat}), 4326)::geography`;
    const [row] = await this.db
      .select({
        id: courses.id,
        name: courses.name,
        address: courses.address,
        city: courses.city,
        region: courses.region,
        timezone: courses.timezone,
        distanceMiles: sql<number>`st_distance(${courses.geog}, ${origin}) / ${METERS_PER_MILE}`,
      })
      .from(courses)
      .where(eq(courses.id, id));
    return row ? withDrive(row) : null;
  }
}

/**
 * Straight-line miles to rough drive minutes: a few minutes to get going plus a road factor.
 * Calibrated against the design's examples (Mount Pleasant ~12 min, Penn National ~95 min).
 * Replace with a drive-time API when one is chosen.
 */
export function estimateDriveMinutes(miles: number): number {
  return Math.round(6 + miles * 1.35);
}

function withDrive(row: Omit<CourseResult, 'driveMinutes'>): CourseResult {
  const distanceMiles = Number(row.distanceMiles);
  return { ...row, distanceMiles, driveMinutes: estimateDriveMinutes(distanceMiles) };
}
