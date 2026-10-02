import { sql } from 'drizzle-orm';
import { courses } from './schema';
import type { Db } from './types';

type SeedCourse = {
  name: string;
  address: string | null;
  city: string;
  region: string;
  lat: number;
  lng: number;
  timezone: string;
};

const ET = 'America/New_York';

/**
 * v1 catalog (SPEC §8): public courses within ~2 hours of Baltimore from the design, plus a few
 * famous public courses nationwide so "All courses" isn't empty. Coordinates are approximate
 * (good to a few hundred meters) and addresses should be verified before launch.
 */
export const SEED_COURSES: SeedCourse[] = [
  {
    name: 'Mount Pleasant Golf Course',
    address: '6001 Hillen Rd',
    city: 'Baltimore',
    region: 'MD',
    lat: 39.3575,
    lng: -76.587,
    timezone: ET,
  },
  {
    name: 'Clifton Park Golf Course',
    address: '2701 St Lo Dr',
    city: 'Baltimore',
    region: 'MD',
    lat: 39.3215,
    lng: -76.58,
    timezone: ET,
  },
  {
    name: 'Carroll Park Golf Course',
    address: '2100 Washington Blvd',
    city: 'Baltimore',
    region: 'MD',
    lat: 39.2775,
    lng: -76.6495,
    timezone: ET,
  },
  {
    name: 'Forest Park Golf Course',
    address: '2900 Hillsdale Rd',
    city: 'Baltimore',
    region: 'MD',
    lat: 39.3195,
    lng: -76.702,
    timezone: ET,
  },
  {
    name: 'Pine Ridge Golf Course',
    address: '2101 Dulaney Valley Rd',
    city: 'Lutherville',
    region: 'MD',
    lat: 39.4385,
    lng: -76.5835,
    timezone: ET,
  },
  {
    name: 'Rocky Point Golf Course',
    address: '1935 Back River Neck Rd',
    city: 'Essex',
    region: 'MD',
    lat: 39.295,
    lng: -76.413,
    timezone: ET,
  },
  {
    name: 'Diamond Ridge Golf Course',
    address: '2309 Ridge Rd',
    city: 'Windsor Mill',
    region: 'MD',
    lat: 39.3335,
    lng: -76.7905,
    timezone: ET,
  },
  {
    name: 'The Woodlands Golf Course',
    address: '2309 Ridge Rd',
    city: 'Windsor Mill',
    region: 'MD',
    lat: 39.336,
    lng: -76.796,
    timezone: ET,
  },
  {
    name: 'Fox Hollow Golf Course',
    address: null,
    city: 'Timonium',
    region: 'MD',
    lat: 39.4555,
    lng: -76.6195,
    timezone: ET,
  },
  {
    name: 'Waverly Woods Golf Course',
    address: '2100 Warwick Way',
    city: 'Marriottsville',
    region: 'MD',
    lat: 39.311,
    lng: -76.882,
    timezone: ET,
  },
  {
    name: 'Mountain Branch Golf Course',
    address: '1827 Mountain Rd',
    city: 'Joppa',
    region: 'MD',
    lat: 39.459,
    lng: -76.377,
    timezone: ET,
  },
  {
    name: 'Greystone Golf Course',
    address: '2115 White Hall Rd',
    city: 'White Hall',
    region: 'MD',
    lat: 39.646,
    lng: -76.629,
    timezone: ET,
  },
  {
    name: 'Renditions Golf Course',
    address: '1380 W Central Ave',
    city: 'Davidsonville',
    region: 'MD',
    lat: 38.941,
    lng: -76.625,
    timezone: ET,
  },
  {
    name: 'Bulle Rock',
    address: '320 Blenheim Ln',
    city: 'Havre de Grace',
    region: 'MD',
    lat: 39.539,
    lng: -76.129,
    timezone: ET,
  },
  {
    name: 'Whiskey Creek Golf Club',
    address: '4804 Whiskey Ct',
    city: 'Ijamsville',
    region: 'MD',
    lat: 39.342,
    lng: -77.353,
    timezone: ET,
  },
  {
    name: 'East Potomac Golf Links',
    address: '972 Ohio Dr SW',
    city: 'Washington',
    region: 'DC',
    lat: 38.873,
    lng: -77.025,
    timezone: ET,
  },
  {
    name: 'Queenstown Harbor',
    address: '310 Links Ln',
    city: 'Queenstown',
    region: 'MD',
    lat: 38.99,
    lng: -76.164,
    timezone: ET,
  },
  {
    name: 'Musket Ridge Golf Club',
    address: '3555 Bennies Hill Rd',
    city: 'Myersville',
    region: 'MD',
    lat: 39.481,
    lng: -77.579,
    timezone: ET,
  },
  {
    name: 'Penn National Golf Club',
    address: '3720 Clubhouse Dr',
    city: 'Fayetteville',
    region: 'PA',
    lat: 39.896,
    lng: -77.526,
    timezone: ET,
  },
  {
    name: 'Bethpage Black',
    address: '99 Quaker Meeting House Rd',
    city: 'Farmingdale',
    region: 'NY',
    lat: 40.745,
    lng: -73.455,
    timezone: ET,
  },
  {
    name: 'Pinehurst No. 2',
    address: '1 Carolina Vista Dr',
    city: 'Pinehurst',
    region: 'NC',
    lat: 35.19,
    lng: -79.469,
    timezone: ET,
  },
  {
    name: 'TPC Sawgrass',
    address: '110 Championship Way',
    city: 'Ponte Vedra Beach',
    region: 'FL',
    lat: 30.1975,
    lng: -81.395,
    timezone: ET,
  },
  {
    name: 'Whistling Straits',
    address: null,
    city: 'Kohler',
    region: 'WI',
    lat: 43.851,
    lng: -87.733,
    timezone: 'America/Chicago',
  },
  {
    name: 'Torrey Pines (South)',
    address: '11480 N Torrey Pines Rd',
    city: 'La Jolla',
    region: 'CA',
    lat: 32.899,
    lng: -117.252,
    timezone: 'America/Los_Angeles',
  },
  {
    name: 'Chambers Bay',
    address: null,
    city: 'University Place',
    region: 'WA',
    lat: 47.201,
    lng: -122.57,
    timezone: 'America/Los_Angeles',
  },
  {
    name: 'Pebble Beach Golf Links',
    address: '1700 17-Mile Dr',
    city: 'Pebble Beach',
    region: 'CA',
    lat: 36.568,
    lng: -121.95,
    timezone: 'America/Los_Angeles',
  },
];

/** Upserts the seed catalog (runs as the schema owner). */
export async function seedCourses(db: Db): Promise<void> {
  await db
    .insert(courses)
    .values(SEED_COURSES.map((c) => ({ ...c, source: 'seed' as const })))
    .onConflictDoUpdate({
      target: [courses.name, courses.city, courses.region],
      set: {
        address: sql`excluded.address`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        timezone: sql`excluded.timezone`,
      },
    });
}
