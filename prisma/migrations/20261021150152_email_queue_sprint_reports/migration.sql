-- CreateTable
CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintReport" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "completedPoints" INTEGER NOT NULL,
    "completedTasks" INTEGER NOT NULL,
    "totalTasks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailJob_deliveredAt_availableAt_lockUntil_idx" ON "EmailJob"("deliveredAt", "availableAt", "lockUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SprintReport_sprintId_key" ON "SprintReport"("sprintId");

-- AddForeignKey
ALTER TABLE "SprintReport" ADD CONSTRAINT "SprintReport_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
