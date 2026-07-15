-- Username becomes non-unique; the (username, tag) PAIR is unique instead.

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tag" TEXT NOT NULL DEFAULT '0000';

-- Backfill: random 4-digit tag for existing users
UPDATE "User" SET "tag" = lpad(floor(random() * 10000)::int::text, 4, '0');

-- CreateIndex
CREATE UNIQUE INDEX "User_username_tag_key" ON "User"("username", "tag");
