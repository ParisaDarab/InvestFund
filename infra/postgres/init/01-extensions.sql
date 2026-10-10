-- Runs once, when the postgres data volume is first initialised (docker-entrypoint-initdb.d).
-- The first Prisma migration (P0-DB-01) enables the same extensions with IF NOT EXISTS, so
-- databases created without this script (CI service containers, Testcontainers) match.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
