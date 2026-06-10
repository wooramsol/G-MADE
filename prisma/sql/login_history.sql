-- Run once in Vercel Postgres SQL console if deploy-time prisma db push does not run.
CREATE TABLE IF NOT EXISTS "login_history" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "email" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "login_history_email_created_at_idx"
  ON "login_history"("email", "created_at" DESC);
