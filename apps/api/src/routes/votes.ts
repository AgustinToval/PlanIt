import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";

const router = Router();

async function getMembership(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
}

function canManage(role: string | undefined): boolean {
  return role === "admin" || role === "helper";
}

function notify(planId: string) {
  io.to(`plan:${planId}`).emit("votes:changed", { planId });
}

// POST /api/votes/plan/:planId — create a vote (any member)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { question, options } = req.body as { question?: string; options?: string[] };
  const cleanOptions = (options ?? []).map((o) => o?.trim()).filter(Boolean) as string[];
  if (!question?.trim()) return res.status(400).json({ error: "Question is required" });
  if (cleanOptions.length < 2) return res.status(400).json({ error: "At least 2 options are required" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const vote = await prisma.vote.create({
      data: {
        question: question.trim(),
        options: cleanOptions,
        results: {},
        planId,
      },
    });
    notify(planId);
    res.status(201).json(vote);
  } catch (e) {
    res.status(500).json({ error: "Failed to create vote" });
  }
});

// POST /api/votes/:id/cast — cast or change your vote
router.post("/:id/cast", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { option } = req.body as { option?: number };

  try {
    const vote = await prisma.vote.findUnique({ where: { id } });
    if (!vote) return res.status(404).json({ error: "Vote not found" });
    if (vote.closed) return res.status(400).json({ error: "This vote is closed" });
    if (!(await getMembership(req.userId!, vote.planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const optionCount = (vote.options as string[]).length;
    if (typeof option !== "number" || option < 0 || option >= optionCount) {
      return res.status(400).json({ error: "Invalid option" });
    }

    const results = { ...(vote.results as Record<string, number>), [req.userId!]: option };
    const updated = await prisma.vote.update({ where: { id }, data: { results } });
    notify(vote.planId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to cast vote" });
  }
});

// POST /api/votes/:id/close — close the vote (admin/helper)
router.post("/:id/close", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const vote = await prisma.vote.findUnique({ where: { id } });
    if (!vote) return res.status(404).json({ error: "Vote not found" });

    const membership = await getMembership(req.userId!, vote.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can close votes" });
    }

    const updated = await prisma.vote.update({ where: { id }, data: { closed: true } });
    notify(vote.planId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to close vote" });
  }
});

// DELETE /api/votes/:id — admin/helper only
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const vote = await prisma.vote.findUnique({ where: { id } });
    if (!vote) return res.status(404).json({ error: "Vote not found" });

    const membership = await getMembership(req.userId!, vote.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can delete votes" });
    }

    await prisma.vote.delete({ where: { id } });
    notify(vote.planId);
    res.json({ message: "Vote deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete vote" });
  }
});

export default router;
