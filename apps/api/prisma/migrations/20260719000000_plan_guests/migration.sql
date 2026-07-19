-- People without the app who share expenses in a plan
CREATE TABLE "PlanGuest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" TEXT NOT NULL,

    CONSTRAINT "PlanGuest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanGuest" ADD CONSTRAINT "PlanGuest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
