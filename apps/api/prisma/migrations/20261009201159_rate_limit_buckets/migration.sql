-- P0-API-02: fixed-window rate-limit counters (core/rateLimit), additive.
-- One row per (preset, key_hash); key_hash is an HMAC of the subject, never a raw IP address.
-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" UUID NOT NULL,
    "preset" VARCHAR(32) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "hits" INTEGER NOT NULL,
    "window_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_ends_at_idx" ON "rate_limit_buckets"("window_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_preset_key_hash_key" ON "rate_limit_buckets"("preset", "key_hash");
