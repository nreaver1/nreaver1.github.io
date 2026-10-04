import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { DEV_SECRET } from '../env';
import { isDeterministicSealed, openDeterministic, sealDeterministic } from '../security/secretbox';

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

/** PostGIS geography point (WGS 84). Read/written as WKT or computed in SQL. */
export const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

/** Key material for PII columns. Rotating APP_SECRET makes stored phone numbers unreadable. */
const piiSecret = () => process.env.APP_SECRET || DEV_SECRET;
const PHONE_PURPOSE = 'pii-phone';

/**
 * Phone number encrypted at rest (SPEC §6) with deterministic AES-256-GCM, so equality lookups
 * (`eq(players.phoneE164, phone)`) and unique indexes work unchanged: Drizzle seals query
 * parameters for this column too. Rows written before encryption (plain "+1…") still read back
 * and are sealed by `encryptLegacyPhones`. Raw SQL against these columns sees ciphertext.
 */
export const encryptedPhone = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return sealDeterministic(piiSecret(), PHONE_PURPOSE, value);
  },
  fromDriver(value) {
    return isDeterministicSealed(value) ? openDeterministic(piiSecret(), PHONE_PURPOSE, value) : value;
  },
});
