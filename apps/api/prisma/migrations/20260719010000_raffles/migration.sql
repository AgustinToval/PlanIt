-- Raffle wheel module: spin a wheel between plan members and/or guests
CREATE TABLE "Raffle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "participants" JSONB NOT NULL,
    "winnerId" TEXT,
    "winnerName" TEXT,
    "spunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" TEXT NOT NULL,

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
