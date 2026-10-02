-- Runs once when the dev database volume is first created.
-- The app connects as this non-superuser role so Row-Level Security is enforced.
-- Table privileges are granted by the migrations (see drizzle/0002_rls.sql).
CREATE ROLE ironed_app LOGIN PASSWORD 'ironed_app_dev' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE ironed_out TO ironed_app;
