import { z } from 'zod';
import type { SCOPES } from '../domain/api-clients';
import {
  ApiClaimInput,
  ApiCreateInviteLinkInput,
  ApiCreateOutingInput,
  ApiUpdateOutingInput,
  ApiUpdateTeeTimeInput,
} from '../domain/partner-outings';
import { CreateWebhookInput, UpdateWebhookInput, WEBHOOK_EVENTS } from '../domain/webhooks';
import { ApiCreateWidgetTokenInput } from '../domain/widget';

/**
 * OpenAPI 3.1 document for /api/v1, generated from the same Zod schemas that validate requests.
 * Response shapes are described with Zod here too, so the docs and the code can't drift silently
 * (the API tests parse real responses with these schemas).
 */

const Player = z.object({ id: z.uuid(), name: z.string() }).nullable();

export const OutingSchema = z.object({
  id: z.uuid(),
  external_ref: z.string().nullable(),
  course: z.object({
    id: z.uuid(),
    name: z.string(),
    address: z.string().nullable(),
    city: z.string(),
    region: z.string(),
  }),
  play_date: z.iso.date(),
  timezone: z.string().describe('IANA zone of the course.'),
  price_cents: z.number().int().nullable(),
  currency: z.string(),
  note: z.string(),
  locked: z.boolean(),
  version: z.number().int().describe('Bumped on every change.'),
  organizer: Player.optional().describe('With players:read.'),
  invite_url: z.url().nullable().describe('The link golfers open to claim a spot.'),
  open_count: z.number().int(),
  total_count: z.number().int(),
  tee_times: z.array(
    z.object({
      id: z.uuid(),
      starts_at: z.iso.datetime(),
      capacity: z.number().int(),
      filled: z.number().int(),
      slots: z.array(
        z.object({
          id: z.uuid(),
          position: z.number().int(),
          status: z.enum(['open', 'taken']),
          player: Player.optional().describe('With players:read.'),
          guest_of: Player.optional().describe('With players:read. Set when the spot is a guest.'),
        }),
      ),
    }),
  ),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const OutingListSchema = z.object({
  data: z.array(OutingSchema),
  next_cursor: z.string().nullable().describe('Pass as ?cursor= for the next page; null on the last page.'),
});

export const ClaimResultSchema = z.object({
  player_id: z.uuid(),
  starts_at: z.iso.datetime(),
  guest_count: z.number().int(),
  outing: OutingSchema,
});

export const InviteLinkSchema = z.object({
  id: z.uuid(),
  outing_id: z.uuid(),
  url: z.url(),
  expires_at: z.iso.datetime().nullable(),
});

export const CourseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string(),
  region: z.string(),
  timezone: z.string(),
  distance_miles: z.number(),
  drive_minutes: z.number().int().describe('Rough estimate from straight-line distance.'),
});

export const WebhookSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  description: z.string(),
  enabled: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const WebhookCreatedSchema = WebhookSchema.extend({
  secret: z.string().describe('Signing secret. Shown only once; store it now.'),
});

export const DeliverySchema = z.object({
  id: z.uuid(),
  type: z.enum(WEBHOOK_EVENTS),
  status: z.enum(['pending', 'delivered', 'failed']),
  attempts: z.number().int(),
  last_status: z.number().int().nullable(),
  last_error: z.string().nullable(),
  next_attempt_at: z.iso.datetime().nullable(),
  delivered_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});

export const WidgetTokenSchema = z.object({
  token: z.string().describe('Opaque and encrypted. Treat it like a short-lived secret.'),
  url: z.url().describe('Put this behind the "Invite your group" button (href of the embed link).'),
  expires_at: z.iso.datetime(),
});

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int(),
  scope: z.string(),
});

export const ProblemSchema = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string().describe('Stable machine-readable reason, e.g. slot_taken, locked, insufficient_scope.'),
  errors: z.record(z.string(), z.string()).optional().describe('Field → message, on validation errors.'),
  outing: OutingSchema.optional().describe('Current tee sheet, on claim conflicts.'),
});

const json = (schema: z.ZodType, io: 'input' | 'output' = 'output') => {
  const s = z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'draft-2020-12' }) as Record<
    string,
    unknown
  >;
  delete s.$schema;
  return s;
};

type Op = {
  summary: string;
  scope?: (typeof SCOPES)[number];
  body?: z.ZodType;
  idempotent?: boolean;
  ok: { status: number; schema?: string; description: string };
  params?: string[];
  query?: Record<string, { schema: Record<string, unknown>; description: string }>;
  errors?: number[];
  tag: string;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function operation(op: Op) {
  const parameters: Record<string, unknown>[] = [
    ...(op.params ?? []).map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    })),
    ...Object.entries(op.query ?? {}).map(([name, q]) => ({ name, in: 'query', required: false, ...q })),
  ];
  if (op.idempotent) parameters.push({ $ref: '#/components/parameters/IdempotencyKey' });
  parameters.push({ $ref: '#/components/parameters/RequestId' });
  const errors = [401, ...(op.scope ? [403] : []), ...(op.errors ?? []), 429];
  return {
    tags: [op.tag],
    summary: op.summary,
    ...(op.scope ? { description: `Requires the \`${op.scope}\` scope.` } : {}),
    security: [{ oauth: op.scope ? [op.scope] : [] }],
    parameters,
    ...(op.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: json(op.body, 'input') } },
          },
        }
      : {}),
    responses: {
      [op.ok.status]: {
        description: op.ok.description,
        ...(op.ok.schema ? { content: { 'application/json': { schema: ref(op.ok.schema) } } } : {}),
      },
      ...Object.fromEntries(
        [...new Set(errors)].map((s) => [s, { $ref: `#/components/responses/Problem${s}` }]),
      ),
    },
  };
}

export function buildOpenApi(appUrl: string) {
  const id = ['id'];
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ironed Out Partner API',
      version: '1.0.0',
      description:
        'Create golf outings from a booking, share one invite link, and follow who claims each spot. ' +
        `Guide: ${appUrl}/developers`,
    },
    servers: [{ url: `${appUrl}/api/v1` }],
    tags: [
      { name: 'Auth' },
      { name: 'Courses' },
      { name: 'Outings' },
      { name: 'Tee times' },
      { name: 'Spots' },
      { name: 'Invite links' },
      { name: 'Webhooks' },
      { name: 'Widget' },
    ],
    paths: {
      '/oauth/token': {
        post: {
          tags: ['Auth'],
          summary: 'Get an access token (OAuth 2.0 client credentials)',
          description:
            'Send client_id and client_secret as HTTP Basic auth or in the form body. Tokens last 15 minutes.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['grant_type'],
                  properties: {
                    grant_type: { const: 'client_credentials' },
                    client_id: { type: 'string' },
                    client_secret: { type: 'string' },
                    scope: { type: 'string', description: 'Space-separated subset of the client’s scopes.' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Access token', content: { 'application/json': { schema: ref('Token') } } },
            400: { description: 'invalid_request, invalid_scope or unsupported_grant_type (RFC 6749 §5.2)' },
            401: { description: 'invalid_client' },
            429: { $ref: '#/components/responses/Problem429' },
          },
        },
      },
      '/courses': {
        get: operation({
          tag: 'Courses',
          summary: 'Search courses',
          query: {
            query: { schema: { type: 'string' }, description: 'Name or town.' },
            scope: {
              schema: { enum: ['near', 'all'], default: 'near' },
              description: 'near = within radius.',
            },
            near: {
              schema: { type: 'string', example: '39.29,-76.61' },
              description: 'lat,lng (default Baltimore).',
            },
            radius_min: {
              schema: { type: 'integer', default: 120 },
              description: 'Approximate drive minutes.',
            },
            limit: { schema: { type: 'integer', default: 30, maximum: 50 }, description: 'Max results.' },
          },
          ok: { status: 200, schema: 'CourseList', description: 'Matching courses, closest first.' },
          errors: [422],
        }),
      },
      '/outings': {
        get: operation({
          tag: 'Outings',
          summary: 'List outings',
          scope: 'outings:read',
          query: {
            cursor: { schema: { type: 'string' }, description: 'From next_cursor.' },
            limit: { schema: { type: 'integer', default: 25, maximum: 100 }, description: 'Page size.' },
            external_ref: { schema: { type: 'string' }, description: 'Your reservation id.' },
            from: { schema: { type: 'string', format: 'date' }, description: 'Play date on or after.' },
            to: { schema: { type: 'string', format: 'date' }, description: 'Play date on or before.' },
          },
          ok: { status: 200, schema: 'OutingList', description: 'Newest first.' },
          errors: [422],
        }),
        post: operation({
          tag: 'Outings',
          summary: 'Create an outing with tee times',
          scope: 'outings:write',
          body: ApiCreateOutingInput,
          idempotent: true,
          ok: { status: 201, schema: 'Outing', description: 'Created, with an invite link.' },
          errors: [400, 409, 422],
        }),
      },
      '/outings/{id}': {
        get: operation({
          tag: 'Outings',
          summary: 'Get an outing and its tee sheet',
          scope: 'outings:read',
          params: id,
          ok: { status: 200, schema: 'Outing', description: 'The outing.' },
          errors: [404],
        }),
        patch: operation({
          tag: 'Outings',
          summary: 'Update note or price, lock or unlock',
          scope: 'outings:write',
          params: id,
          body: ApiUpdateOutingInput,
          ok: { status: 200, schema: 'Outing', description: 'The updated outing.' },
          errors: [404, 409, 422],
        }),
      },
      '/outings/{id}/tee-times': {
        post: operation({
          tag: 'Tee times',
          summary: 'Add a tee time after the last one',
          scope: 'outings:write',
          params: id,
          idempotent: true,
          ok: { status: 201, schema: 'Outing', description: 'The outing with the new tee time.' },
          errors: [400, 404, 409],
        }),
      },
      '/tee-times/{id}': {
        patch: operation({
          tag: 'Tee times',
          summary: 'Change the number of spots (2–5)',
          scope: 'outings:write',
          params: id,
          body: ApiUpdateTeeTimeInput,
          ok: { status: 200, schema: 'Outing', description: 'The updated outing.' },
          errors: [404, 409, 422],
        }),
        delete: operation({
          tag: 'Tee times',
          summary: 'Delete an empty tee time',
          scope: 'outings:write',
          params: id,
          ok: { status: 200, schema: 'Outing', description: 'The outing without that tee time.' },
          errors: [404, 409],
        }),
      },
      '/slots/{id}/claim': {
        post: operation({
          tag: 'Spots',
          summary: 'Seat a golfer (and guests) in a spot',
          scope: 'outings:write',
          params: id,
          body: ApiClaimInput,
          idempotent: true,
          ok: { status: 201, schema: 'ClaimResult', description: 'Seated.' },
          errors: [400, 404, 409, 422],
        }),
      },
      '/slots/{id}/release': {
        post: operation({
          tag: 'Spots',
          summary: 'Free a spot (a golfer and their guests, or one guest)',
          scope: 'outings:write',
          params: id,
          idempotent: true,
          ok: { status: 200, schema: 'Outing', description: 'The updated outing.' },
          errors: [400, 404, 409],
        }),
      },
      '/outings/{id}/invite-links': {
        post: operation({
          tag: 'Invite links',
          summary: 'Create another invite link (optionally expiring)',
          scope: 'outings:write',
          params: id,
          body: ApiCreateInviteLinkInput,
          idempotent: true,
          ok: { status: 201, schema: 'InviteLink', description: 'The new link.' },
          errors: [400, 404, 422],
        }),
      },
      '/invite-links/{id}': {
        delete: operation({
          tag: 'Invite links',
          summary: 'Revoke an invite link',
          scope: 'outings:write',
          params: id,
          ok: { status: 204, description: 'Revoked.' },
          errors: [404],
        }),
      },
      '/widget-tokens': {
        post: operation({
          tag: 'Widget',
          summary: 'Make an "Invite your group" button for a booking',
          scope: 'outings:write',
          body: ApiCreateWidgetTokenInput,
          idempotent: true,
          ok: {
            status: 201,
            schema: 'WidgetToken',
            description:
              'A URL for the embed button. Nothing is created until the golfer taps it and confirms; then the outing is created once, as if you had called POST /outings.',
          },
          errors: [400, 422],
        }),
      },
      '/webhooks': {
        get: operation({
          tag: 'Webhooks',
          summary: 'List webhook endpoints',
          scope: 'webhooks:manage',
          ok: { status: 200, schema: 'WebhookList', description: 'Endpoints.' },
        }),
        post: operation({
          tag: 'Webhooks',
          summary: 'Add a webhook endpoint',
          scope: 'webhooks:manage',
          body: CreateWebhookInput(),
          idempotent: true,
          ok: {
            status: 201,
            schema: 'WebhookCreated',
            description: 'Created. Includes the signing secret once.',
          },
          errors: [400, 409, 422],
        }),
      },
      '/webhooks/{id}': {
        get: operation({
          tag: 'Webhooks',
          summary: 'Get a webhook endpoint',
          scope: 'webhooks:manage',
          params: id,
          ok: { status: 200, schema: 'Webhook', description: 'The endpoint.' },
          errors: [404],
        }),
        patch: operation({
          tag: 'Webhooks',
          summary: 'Change URL, events, description, or pause it',
          scope: 'webhooks:manage',
          params: id,
          body: UpdateWebhookInput(),
          ok: { status: 200, schema: 'Webhook', description: 'The updated endpoint.' },
          errors: [404, 422],
        }),
        delete: operation({
          tag: 'Webhooks',
          summary: 'Delete a webhook endpoint',
          scope: 'webhooks:manage',
          params: id,
          ok: { status: 204, description: 'Deleted.' },
          errors: [404],
        }),
      },
      '/webhooks/{id}/deliveries': {
        get: operation({
          tag: 'Webhooks',
          summary: 'Recent deliveries to an endpoint',
          scope: 'webhooks:manage',
          params: id,
          ok: { status: 200, schema: 'DeliveryList', description: 'Newest first.' },
          errors: [404],
        }),
      },
    },
    components: {
      securitySchemes: {
        oauth: {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: `${appUrl}/api/v1/oauth/token`,
              scopes: {
                'outings:read': 'Read outings and tee sheets',
                'outings:write': 'Create and change outings, seat and release golfers',
                'players:read': 'See golfer names on tee sheets',
                'webhooks:manage': 'Manage webhook endpoints',
              },
            },
          },
        },
      },
      parameters: {
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          description:
            'Unique per logical request (e.g. a UUID). Retrying with the same key replays the first response for 24 hours.',
          schema: { type: 'string', maxLength: 255 },
        },
        RequestId: {
          name: 'X-Request-Id',
          in: 'header',
          required: false,
          description: 'Echoed back; generated when absent. Quote it when asking for help.',
          schema: { type: 'string', maxLength: 100 },
        },
      },
      responses: Object.fromEntries(
        [400, 401, 403, 404, 409, 422, 429].map((s) => [
          `Problem${s}`,
          {
            description:
              {
                400: 'Bad request (e.g. missing Idempotency-Key, invalid JSON)',
                401: 'Missing or invalid access token',
                403: 'Token lacks the required scope',
                404: 'Not found (or not in your tenant)',
                409: 'Conflict (spot taken, outing locked, key in flight)',
                422: 'Validation failed',
                429: 'Rate limited; see Retry-After',
              }[s] ?? 'Error',
            content: { 'application/problem+json': { schema: ref('Problem') } },
          },
        ]),
      ),
      schemas: {
        Token: json(TokenResponseSchema),
        Outing: json(OutingSchema),
        OutingList: json(OutingListSchema),
        ClaimResult: json(ClaimResultSchema),
        InviteLink: json(InviteLinkSchema),
        WidgetToken: json(WidgetTokenSchema),
        CourseList: json(z.object({ data: z.array(CourseSchema) })),
        Webhook: json(WebhookSchema),
        WebhookCreated: json(WebhookCreatedSchema),
        WebhookList: json(z.object({ data: z.array(WebhookSchema) })),
        DeliveryList: json(z.object({ data: z.array(DeliverySchema) })),
        Problem: json(ProblemSchema),
      },
    },
  };
}
