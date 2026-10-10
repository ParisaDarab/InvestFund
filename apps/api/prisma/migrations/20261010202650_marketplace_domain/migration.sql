-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('founder', 'supporter', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "StartupStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('negotiating', 'declined', 'withdrawn', 'expired', 'accepted', 'funding_reported', 'receipt_disputed', 'cancellation_requested', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'countered', 'superseded', 'accepted', 'declined', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('grant', 'donation');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('all_connections', 'selected');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "google_sub" VARCHAR(255) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "avatar_url" VARCHAR(1024),
    "role" "UserRole",
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "onboarded_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "previous_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "headline" VARCHAR(120),
    "bio" VARCHAR(2000),
    "country" CHAR(2),
    "linkedin_url" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "founder_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "supporter_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "bio" VARCHAR(2000),
    "sectors" VARCHAR(40)[],
    "stages" VARCHAR(40)[],
    "purposes" VARCHAR(40)[],
    "countries" CHAR(2)[],
    "funding_min_minor" BIGINT,
    "funding_max_minor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supporter_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "startups" (
    "id" UUID NOT NULL,
    "founder_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "tagline" VARCHAR(140),
    "description" VARCHAR(5000),
    "problem" VARCHAR(2000),
    "solution" VARCHAR(2000),
    "sector" VARCHAR(40),
    "stage" VARCHAR(40),
    "country" CHAR(2),
    "target_market" VARCHAR(200),
    "product_description" VARCHAR(2000),
    "business_model" VARCHAR(1000),
    "team_description" VARCHAR(2000),
    "website_url" VARCHAR(255),
    "funding_purposes" VARCHAR(40)[],
    "funding_purpose_text" VARCHAR(2000),
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "target_amount_minor" BIGINT,
    "min_amount_minor" BIGINT,
    "max_amount_minor" BIGINT,
    "funding_deadline" DATE,
    "status" "StartupStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "startups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "startup_milestones" (
    "id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "target_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "target_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "startup_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_startups" (
    "user_id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_startups_pkey" PRIMARY KEY ("user_id","startup_id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "supporter_id" UUID NOT NULL,
    "founder_id" UUID NOT NULL,
    "initiator_id" UUID NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(1000),
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "client_message_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "supporter_id" UUID NOT NULL,
    "founder_id" UUID NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'negotiating',
    "current_offer_id" UUID,
    "accepted_offer_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancellation_requested_by_id" UUID,
    "cancellation_from_status" "DealStatus",
    "cancellation_reason" VARCHAR(1000),
    "funding_reported_at" TIMESTAMPTZ(6),
    "receipt_confirmed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "previous_offer_id" UUID,
    "created_by_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "funding_type" "FundingType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "purpose" VARCHAR(2000) NOT NULL,
    "conditions" VARCHAR(4000),
    "message" VARCHAR(2000),
    "respond_by" TIMESTAMPTZ(6),
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "responded_by_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_milestones" (
    "offer_id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,

    CONSTRAINT "offer_milestones_pkey" PRIMARY KEY ("offer_id","milestone_id")
);

-- CreateTable
CREATE TABLE "deal_events" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "from_status" "DealStatus",
    "to_status" "DealStatus" NOT NULL,
    "offer_id" UUID,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "link" VARCHAR(255) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "to_email" CITEXT NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" VARCHAR(200) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(300),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "startup_documents" (
    "id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'all_connections',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "startup_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_grants" (
    "document_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_grants_pkey" PRIMARY KEY ("document_id","connection_id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "target_user_id" UUID,
    "target_startup_id" UUID,
    "category" VARCHAR(40) NOT NULL,
    "details" VARCHAR(2000),
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "action" VARCHAR(40),
    "resolution_note" VARCHAR(2000),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_previous_hash_idx" ON "sessions"("previous_hash");

-- CreateIndex
CREATE UNIQUE INDEX "startups_slug_key" ON "startups"("slug");

-- CreateIndex
CREATE INDEX "startups_founder_id_idx" ON "startups"("founder_id");

-- CreateIndex
CREATE INDEX "startups_status_published_at_id_idx" ON "startups"("status", "published_at" DESC, "id");

-- CreateIndex
CREATE INDEX "startups_status_sector_idx" ON "startups"("status", "sector");

-- CreateIndex
CREATE INDEX "startup_milestones_startup_id_position_idx" ON "startup_milestones"("startup_id", "position");

-- CreateIndex
CREATE INDEX "saved_startups_user_id_created_at_idx" ON "saved_startups"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "connections_founder_id_status_created_at_idx" ON "connections"("founder_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "connections_supporter_id_status_created_at_idx" ON "connections"("supporter_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "connections_startup_id_supporter_id_idx" ON "connections"("startup_id", "supporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_connection_id_key" ON "conversations"("connection_id");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_id_client_message_id_key" ON "messages"("sender_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_current_offer_id_key" ON "deals"("current_offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_accepted_offer_id_key" ON "deals"("accepted_offer_id");

-- CreateIndex
CREATE INDEX "deals_supporter_id_updated_at_idx" ON "deals"("supporter_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "deals_founder_id_updated_at_idx" ON "deals"("founder_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "deals_startup_id_status_idx" ON "deals"("startup_id", "status");

-- CreateIndex
CREATE INDEX "deals_connection_id_idx" ON "deals"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_previous_offer_id_key" ON "offers"("previous_offer_id");

-- CreateIndex
CREATE INDEX "offers_status_respond_by_idx" ON "offers"("status", "respond_by");

-- CreateIndex
CREATE UNIQUE INDEX "offers_deal_id_revision_key" ON "offers"("deal_id", "revision");

-- CreateIndex
CREATE INDEX "deal_events_deal_id_created_at_idx" ON "deal_events"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_id_idx" ON "notifications"("user_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupe_key_key" ON "email_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "startup_documents_storage_key_key" ON "startup_documents"("storage_key");

-- CreateIndex
CREATE INDEX "startup_documents_startup_id_deleted_at_idx" ON "startup_documents"("startup_id", "deleted_at");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_profiles" ADD CONSTRAINT "founder_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supporter_profiles" ADD CONSTRAINT "supporter_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startups" ADD CONSTRAINT "startups_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_milestones" ADD CONSTRAINT "startup_milestones_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_startups" ADD CONSTRAINT "saved_startups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_startups" ADD CONSTRAINT "saved_startups_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_supporter_id_fkey" FOREIGN KEY ("supporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_supporter_id_fkey" FOREIGN KEY ("supporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_previous_offer_id_fkey" FOREIGN KEY ("previous_offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_milestones" ADD CONSTRAINT "offer_milestones_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_milestones" ADD CONSTRAINT "offer_milestones_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "startup_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_documents" ADD CONSTRAINT "startup_documents_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_documents" ADD CONSTRAINT "startup_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_grants" ADD CONSTRAINT "document_grants_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "startup_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_grants" ADD CONSTRAINT "document_grants_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_grants" ADD CONSTRAINT "document_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_startup_id_fkey" FOREIGN KEY ("target_startup_id") REFERENCES "startups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Invariants Prisma cannot model (docs/DATABASE.md §Constraints) ───────────

-- At most one active (pending or accepted) connection per startup/supporter pair.
CREATE UNIQUE INDEX "connections_active_pair_key" ON "connections"("startup_id", "supporter_id")
  WHERE "status" IN ('pending', 'accepted');

-- At most one open negotiation per connection.
CREATE UNIQUE INDEX "deals_open_negotiation_key" ON "deals"("connection_id")
  WHERE "status" = 'negotiating';

-- Money is positive, ranges are ordered and currencies are upper-case ISO 4217 codes.
ALTER TABLE "startups"
  ADD CONSTRAINT "startups_amounts_positive" CHECK (
    ("target_amount_minor" IS NULL OR "target_amount_minor" > 0) AND
    ("min_amount_minor" IS NULL OR "min_amount_minor" > 0) AND
    ("max_amount_minor" IS NULL OR "max_amount_minor" > 0)),
  ADD CONSTRAINT "startups_range_ordered" CHECK (
    "min_amount_minor" IS NULL OR "max_amount_minor" IS NULL OR "min_amount_minor" <= "max_amount_minor"),
  ADD CONSTRAINT "startups_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "startup_milestones"
  ADD CONSTRAINT "startup_milestones_amount_positive" CHECK ("target_amount_minor" > 0),
  ADD CONSTRAINT "startup_milestones_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "supporter_profiles"
  ADD CONSTRAINT "supporter_profiles_range" CHECK (
    ("funding_min_minor" IS NULL OR "funding_min_minor" > 0) AND
    ("funding_max_minor" IS NULL OR "funding_max_minor" > 0) AND
    ("funding_min_minor" IS NULL OR "funding_max_minor" IS NULL OR "funding_min_minor" <= "funding_max_minor")),
  ADD CONSTRAINT "supporter_profiles_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_amount_positive" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "offers_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "offers_parties_differ" CHECK ("created_by_id" <> "recipient_id");
ALTER TABLE "connections"
  ADD CONSTRAINT "connections_parties_differ" CHECK ("supporter_id" <> "founder_id");
ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_target_present" CHECK (
    ("target_type" = 'user' AND "target_user_id" IS NOT NULL) OR
    ("target_type" = 'startup' AND "target_startup_id" IS NOT NULL));
