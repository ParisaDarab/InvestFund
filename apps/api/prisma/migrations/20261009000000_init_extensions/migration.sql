-- P0-DB-01: enable the extensions every environment needs (docs/DATABASE.md).
-- infra/postgres/init/01-extensions.sql does the same for the compose volume; IF NOT EXISTS keeps
-- both paths idempotent (CI service containers and per-suite test schemas only run migrations).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
