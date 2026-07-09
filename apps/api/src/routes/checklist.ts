import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";
import { touchPlan } from "../lib/touch";

const router = Router();

async function getMembership(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
}

function notify(planId: string) {
  io.to(`plan:${planId}`).emit("checklist:changed", { planId });
  void touchPlan(planId, "checklist");
}

// POST /api/checklist/plan/:planId — add an item (any member)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { title, category } = req.body as { title?: string; category?: string };
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const item = await prisma.checkItem.create({
      data: { title: title.trim(), category: category?.trim() || null, planId },
    });
    notify(planId);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: "Failed to add item" });
  }
});

// PATCH /api/checklist/:id — toggle/assign/edit (any member)
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { checked, assignedTo, title, category } = req.body as {
    checked?: boolean; assignedTo?: string | null; title?: string; category?: string | null;
  };
  try {
    const item = await prisma.checkItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (!(await getMembership(req.userId!, item.planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    // assignedTo must be a plan member (or null to unassign)
    if (assignedTo !== undefined && assignedTo !== null) {
      const target = await getMembership(assignedTo, item.planId);
      if (!target) return res.status(400).json({ error: "Assignee is not in this plan" });
    }

    const updated = await prisma.checkItem.update({
      where: { id },
      data: {
        checked: checked !== undefined ? !!checked : undefined,
        assignedTo: assignedTo !== undefined ? assignedTo : undefined,
        title: title?.trim() || undefined,
        category: category !== undefined ? (category?.trim() || null) : undefined,
      },
    });
    notify(item.planId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update item" });
  }
});

// DELETE /api/checklist/:id — admin/helper only
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const item = await prisma.checkItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const membership = await getMembership(req.userId!, item.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (membership.role !== "admin" && membership.role !== "helper") {
      return res.status(403).json({ error: "Only the plan admin or helpers can delete items" });
    }

    await prisma.checkItem.delete({ where: { id } });
    notify(item.planId);
    res.json({ message: "Item deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router;
