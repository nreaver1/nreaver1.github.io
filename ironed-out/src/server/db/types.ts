import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

export type Schema = typeof schema;

/** Any Drizzle Postgres database (postgres-js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
