-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "sign_requests" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unsigned_tx" JSONB NOT NULL,
    "digest" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_audit" (
    "id" BIGSERIAL NOT NULL,
    "intent_id" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decision_usd_micros" BIGINT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_events" (
    "id" BIGSERIAL NOT NULL,
    "intent_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_ledger" (
    "wallet_id" TEXT NOT NULL,
    "utc_day" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "usd_micros" BIGINT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reclaimed_at" TIMESTAMPTZ(6),
    "reclaim_of" TEXT,

    CONSTRAINT "spend_ledger_pkey" PRIMARY KEY ("wallet_id","utc_day","intent_id")
);

-- CreateTable
CREATE TABLE "intents" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "quote_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("quote_id")
);

-- CreateTable
CREATE TABLE "deploy_records" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "release_tag" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "payload_file" TEXT NOT NULL,
    "calldata_keccak" TEXT NOT NULL,
    "expected_nonce" INTEGER,
    "decoded_args" JSONB,
    "frozen_constants" JSONB,
    "status" TEXT NOT NULL,
    "tx_hash" TEXT,
    "deployed_address" TEXT,
    "readback_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deploy_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_artifacts" (
    "verification_id" TEXT NOT NULL,
    "artifact" JSONB NOT NULL,
    "seeded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_artifacts_pkey" PRIMARY KEY ("verification_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_executions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "slot_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intent_id" TEXT,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "detail" TEXT,

    CONSTRAINT "order_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kill_switch_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "kill_switch_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kill_switch_audit" (
    "id" BIGSERIAL NOT NULL,
    "from_mode" TEXT NOT NULL,
    "to_mode" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kill_switch_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "address" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "chains" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_key_rotation_at" TIMESTAMPTZ(6),

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "security_policies" (
    "wallet_address" TEXT NOT NULL,
    "allowed_origins" TEXT[],
    "daily_cap_micros" BIGINT NOT NULL,
    "approval_threshold_micros" BIGINT NOT NULL,
    "allowed_chains" TEXT[],
    "reject_encoded_payloads" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateIndex
CREATE UNIQUE INDEX "sign_requests_intent_id_key" ON "sign_requests"("intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_executions_order_id_slot_key_key" ON "order_executions"("order_id", "slot_key");

-- AddForeignKey
ALTER TABLE "order_executions" ADD CONSTRAINT "order_executions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "security_policies" ADD CONSTRAINT "security_policies_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "wallets"("address") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Hand-maintained constraints + indexes (design doc §4; Prisma schema
-- carries no CHECK/index annotations for these).

-- Micro-USD non-negativity (Review54 binding condition 3).
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_usd_micros_nonneg" CHECK ("usd_micros" >= 0);

-- Kill-switch singleton row (design §4: id = 1).
ALTER TABLE "kill_switch_state" ADD CONSTRAINT "kill_switch_state_singleton" CHECK ("id" = 1);

-- Status/kind domains (fail-closed at the storage layer too).
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_status_domain"
  CHECK ("status" IN ('dry_run','pending','signed','rejected'));
ALTER TABLE "intents" ADD CONSTRAINT "intents_kind_domain"
  CHECK ("kind" IN ('transfer','swap','deploy','approve'));
ALTER TABLE "deploy_records" ADD CONSTRAINT "deploy_records_status_domain"
  CHECK ("status" IN ('published','signed_offchain','broadcast','readback_passed','readback_rejected'));

-- Indexed scalar spine (JSONB policy, design §4).
CREATE INDEX "decision_audit_intent_id_idx" ON "decision_audit"("intent_id");
CREATE INDEX "sign_events_intent_id_idx" ON "sign_events"("intent_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
