import { prisma } from "./prisma";

// Record activity on a plan: bumps lastActivityAt and the per-module timestamp.
// Fire-and-forget safe — never throws.
export async function touchPlan(planId: string, module: string): Promise<void> {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { moduleActivity: true },
    });
    if (!plan) return;
    const activity = { ...(plan.moduleActivity as Record<string, string>) };
    const now = new Date();
    activity[module] = now.toISOString();
    await prisma.plan.update({
      where: { id: planId },
      data: { lastActivityAt: now, moduleActivity: activity },
    });
  } catch {
    /* non-critical */
  }
}

export async function touchGroup(groupId: string): Promise<void> {
  try {
    await prisma.group.update({
      where: { id: groupId },
      data: { lastActivityAt: new Date() },
    });
  } catch {
    /* non-critical */
  }
}
