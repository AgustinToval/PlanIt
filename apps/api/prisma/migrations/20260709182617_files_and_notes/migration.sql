-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PlanFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" TEXT NOT NULL,

    CONSTRAINT "PlanFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlanFile" ADD CONSTRAINT "PlanFile_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
