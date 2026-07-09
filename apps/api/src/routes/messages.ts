import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";
import { touchPlan, touchGroup } from "../lib/touch";

const router = Router();

// GET messages for a plan
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    const messages = await prisma.message.findMany({
      where: {
        planId,
        plan: { members: { some: { userId: req.userId, status: "member" } } },
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// GET messages for a group
router.get("/group/:groupId", authMiddleware, async (req: Request, res: Response) => {
  const groupId = String(req.params["groupId"]);
  try {
    const messages = await prisma.message.findMany({
      where: {
        groupId,
        group: { members: { some: { userId: req.userId, status: "member" } } },
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST message to a group (persists + broadcasts via socket)
router.post("/group/:groupId", authMiddleware, async (req: Request, res: Response) => {
  const groupId = String(req.params["groupId"]);
  const { content } = req.body as { content: string };
  if (!content?.trim()) return res.status(400).json({ error: "Message is empty" });

  try {
    const isMember = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId }, status: "member" },
    });
    if (!isMember) return res.status(403).json({ error: "Not a member of this group" });

    const message = await prisma.message.create({
      data: { content: content.trim(), groupId, userId: req.userId! },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    io.to(`group:${groupId}`).emit("message:new", message);
    void touchGroup(groupId);
    res.status(201).json(message);
  } catch (e) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// POST message to a plan (persists + broadcasts via socket)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { content } = req.body as { content: string };
  if (!content?.trim()) return res.status(400).json({ error: "Message is empty" });

  try {
    const isMember = await prisma.plan.findFirst({
      where: { id: planId, members: { some: { userId: req.userId, status: "member" } } },
    });
    if (!isMember) return res.status(403).json({ error: "Not a member of this plan" });

    const message = await prisma.message.create({
      data: { content: content.trim(), planId, userId: req.userId! },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    io.to(`plan:${planId}`).emit("message:new", message);
    void touchPlan(planId, "chat");
    res.status(201).json(message);
  } catch (e) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
