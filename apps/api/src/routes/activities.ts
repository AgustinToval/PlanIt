import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";

const router = Router();

async function getMembership(userId: string, planId: string) {
  return prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
}

function canManage(role: string | undefined): boolean {
  return role === "admin" || role === "helper";
}

function notify(planId: string) {
  io.to(`plan:${planId}`).emit("activities:changed", { planId });
}

// POST /api/activities/plan/:planId — add an activity (any member)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { title, notes, time } = req.body as { title?: string; notes?: string; time?: string };
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const count = await prisma.activity.count({ where: { planId } });
    const activity = await prisma.activity.create({
      data: {
        title: title.trim(),
        notes: notes?.trim() || null,
        time: time ? new Date(time) : null,
        order: count,
        planId,
      },
    });
    notify(planId);
    res.status(201).json(activity);
  } catch (e) {
    res.status(500).json({ error: "Failed to add activity" });
  }
});

// PATCH /api/activities/:id — edit / mark done (any member)
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { title, notes, time, done } = req.body as {
    title?: string; notes?: string | null; time?: string | null; done?: boolean;
  };
  try {
    const activity = await prisma.activity.findUnique({ where: { id } });
    if (!activity) return res.status(404).json({ error: "Activity not found" });
    if (!(await getMembership(req.userId!, activity.planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const updated = await prisma.activity.update({
      where: { id },
      data: {
        title: title?.trim() || undefined,
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
        time: time !== undefined ? (time ? new Date(time) : null) : undefined,
        done: done !== undefined ? !!done : undefined,
      },
    });
    notify(activity.planId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update activity" });
  }
});

// POST /api/activities/plan/:planId/reorder — set new order (admin/helper)
router.post("/plan/:planId/reorder", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!orderedIds?.length) return res.status(400).json({ error: "orderedIds is required" });

  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can reorder activities" });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.activity.updateMany({
          where: { id, planId },
          data: { order: index },
        })
      )
    );
    notify(planId);
    res.json({ message: "Reordered" });
  } catch (e) {
    res.status(500).json({ error: "Failed to reorder" });
  }
});

// DELETE /api/activities/:id — admin/helper only
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const activity = await prisma.activity.findUnique({ where: { id } });
    if (!activity) return res.status(404).json({ error: "Activity not found" });

    const membership = await getMembership(req.userId!, activity.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can delete activities" });
    }

    await prisma.activity.delete({ where: { id } });
    notify(activity.planId);
    res.json({ message: "Activity deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

export default router;
