import { SeedProvider } from '@/server/domain/courses';
import { DomainError } from '@/server/errors';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

/** GET /api/v1/courses?query=&near=lat,lng&radius_min=120&scope=near|all */
export const GET = apiRoute({}, async ({ deps, query }) => {
  const near = query.get('near');
  let lat: number | undefined;
  let lng: number | undefined;
  if (near) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(near);
    if (!m)
      throw new DomainError('invalid_input', 'near must be "lat,lng".', { fields: { near: 'Use lat,lng.' } });
    lat = Number(m[1]);
    lng = Number(m[2]);
  }
  const radiusMin = query.get('radius_min');
  // Inverse of estimateDriveMinutes: drive minutes → straight-line miles.
  const radiusMiles = radiusMin === null ? undefined : (Number(radiusMin) - 6) / 1.35;
  if (radiusMiles !== undefined && !Number.isFinite(radiusMiles)) {
    throw new DomainError('invalid_input', 'radius_min must be a number of minutes.', {
      fields: { radius_min: 'Use minutes.' },
    });
  }
  const scope = query.get('scope');
  const results = await new SeedProvider(deps.db).search({
    query: query.get('query') ?? '',
    scope: scope === 'all' ? 'all' : 'near',
    lat,
    lng,
    radiusMiles: radiusMiles === undefined ? undefined : Math.max(1, Math.min(500, radiusMiles)),
    limit: query.get('limit') ?? undefined,
  });
  return {
    body: {
      data: results.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        city: c.city,
        region: c.region,
        timezone: c.timezone,
        distance_miles: Math.round(c.distanceMiles * 10) / 10,
        drive_minutes: c.driveMinutes,
      })),
    },
  };
});
