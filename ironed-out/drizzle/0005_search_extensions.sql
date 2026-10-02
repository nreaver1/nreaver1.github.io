-- Course search (SPEC §8): trigram matching on names/towns and PostGIS distance.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;
