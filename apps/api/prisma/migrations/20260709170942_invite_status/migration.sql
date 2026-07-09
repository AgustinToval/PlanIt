-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'member';

-- AlterTable
ALTER TABLE "PlanMember" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'member';
