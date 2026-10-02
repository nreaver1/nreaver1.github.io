import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Case-insensitive text (requires the citext extension, created in the first migration). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

/** UUIDv7 primary key, generated in the app so ids are time-ordered. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};
