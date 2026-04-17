-- CreateEnum
CREATE TYPE "WorkLogStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TimeSegmentStatus" AS ENUM ('ACTIVE', 'REMOVED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SettlementSourceType" AS ENUM ('TIME_SEGMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SettlementAttemptStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worklogs" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "status" "WorkLogStatus" NOT NULL,
    "last_settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worklogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_segments" (
    "id" TEXT NOT NULL,
    "worklog_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "minutes_duration" INTEGER NOT NULL,
    "hourly_rate_snapshot" DECIMAL(12,2) NOT NULL,
    "status" "TimeSegmentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustments" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "time_segment_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_attempts" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "SettlementAttemptStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" TEXT NOT NULL,
    "settlement_run_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "source_type" "SettlementSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remittances" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "settlement_run_id" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "RemittanceStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AdjustmentToSettlementLine" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdjustmentToSettlementLine_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SettlementLineToTimeSegment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SettlementLineToTimeSegment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "workers_email_key" ON "workers"("email");

-- CreateIndex
CREATE INDEX "worklogs_worker_id_idx" ON "worklogs"("worker_id");

-- CreateIndex
CREATE INDEX "worklogs_task_id_idx" ON "worklogs"("task_id");

-- CreateIndex
CREATE INDEX "time_segments_worklog_id_idx" ON "time_segments"("worklog_id");

-- CreateIndex
CREATE INDEX "adjustments_worker_id_idx" ON "adjustments"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_period_start_period_end_key" ON "settlement_attempts"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "settlement_lines_worker_id_idx" ON "settlement_lines"("worker_id");

-- CreateIndex
CREATE INDEX "settlement_lines_settlement_run_id_idx" ON "settlement_lines"("settlement_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_lines_source_type_source_id_key" ON "settlement_lines"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "remittances_worker_id_idx" ON "remittances"("worker_id");

-- CreateIndex
CREATE INDEX "remittances_settlement_run_id_idx" ON "remittances"("settlement_run_id");

-- CreateIndex
CREATE INDEX "_AdjustmentToSettlementLine_B_index" ON "_AdjustmentToSettlementLine"("B");

-- CreateIndex
CREATE INDEX "_SettlementLineToTimeSegment_B_index" ON "_SettlementLineToTimeSegment"("B");

-- AddForeignKey
ALTER TABLE "worklogs" ADD CONSTRAINT "worklogs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklogs" ADD CONSTRAINT "worklogs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_segments" ADD CONSTRAINT "time_segments_worklog_id_fkey" FOREIGN KEY ("worklog_id") REFERENCES "worklogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_time_segment_id_fkey" FOREIGN KEY ("time_segment_id") REFERENCES "time_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_run_id_fkey" FOREIGN KEY ("settlement_run_id") REFERENCES "settlement_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_settlement_run_id_fkey" FOREIGN KEY ("settlement_run_id") REFERENCES "settlement_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdjustmentToSettlementLine" ADD CONSTRAINT "_AdjustmentToSettlementLine_A_fkey" FOREIGN KEY ("A") REFERENCES "adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdjustmentToSettlementLine" ADD CONSTRAINT "_AdjustmentToSettlementLine_B_fkey" FOREIGN KEY ("B") REFERENCES "settlement_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SettlementLineToTimeSegment" ADD CONSTRAINT "_SettlementLineToTimeSegment_A_fkey" FOREIGN KEY ("A") REFERENCES "settlement_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SettlementLineToTimeSegment" ADD CONSTRAINT "_SettlementLineToTimeSegment_B_fkey" FOREIGN KEY ("B") REFERENCES "time_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
