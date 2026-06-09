import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET all plans for a group
router.get("/group/:groupId", authMiddleware, async (req: Request, res: Response) => {
  const groupId = String(req.params["groupId"]);
  try {
    const plans = await prisma.plan.findMany({
      where: {
        groupId,
        group: { members: { some: { userId: req.userId } } },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { messages: true, photos: true, expenses: true } },
      },
      orderBy: { startDate: "asc" },
    });
    res.json(plans);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// POST create a plan
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const { title, description, type, startDate, endDate, location, groupId } = req.body as {
    title: string;
    description?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    groupId: string;
  };
  if (!title || !groupId) return res.status(400).json({ error: "Title and groupId are required" });

  try {
    const isMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: req.userId! },
    });
    if (!isMember) return res.status(403).json({ error: "Not a group member" });

    const plan = await prisma.plan.create({
      data: {
        title,
        description,
        type: type ?? "full",
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        location,
        groupId,
        members: { create: { userId: req.userId!, rsvp: "yes" } },
      },
      include: {
        members: { include: { user: true } },
        group: { select: { name: true } },
      },
    });
    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// GET plan by id
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id,
        group: { members: { some: { userId: req.userId } } },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true, username: true } } } },
        activities: { orderBy: { order: "asc" } },
        checkItems: true,
        expenses: { include: { splits: true, payer: { select: { id: true, name: true } } } },
        messages: { include: { user: { select: { id: true, name: true, avatar: true } } }, take: 50, orderBy: { createdAt: "asc" } },
        photos: { include: { user: { select: { id: true, name: true } } } },
        reminders: true,
        votes: true,
      },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch plan" });
  }
});

// POST join plan via invite code
router.post("/join/:inviteCode", authMiddleware, async (req: Request, res: Response) => {
  const inviteCode = String(req.params["inviteCode"]);
  try {
    const plan = await prisma.plan.findUnique({ where: { inviteCode } });
    if (!plan) return res.status(404).json({ error: "Invalid invite link" });

    const existing = await prisma.planMember.findUnique({
      where: { userId_planId: { userId: req.userId!, planId: plan.id } },
    });
    if (existing) return res.status(400).json({ error: "Already in this plan" });

    await prisma.planMember.create({ data: { userId: req.userId!, planId: plan.id } });
    res.json({ message: "Joined plan", plan });
  } catch (e) {
    res.status(500).json({ error: "Failed to join plan" });
  }
});

// PATCH update plan
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { title, description, startDate, endDate, location, status } = req.body as {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    status?: string;
  };
  try {
    const plan = await prisma.plan.update({
      where: { id },
      data: {
        title,
        description,
        location,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// POST update RSVP
router.post("/:id/rsvp", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { rsvp } = req.body as { rsvp: string };
  try {
    const member = await prisma.planMember.upsert({
      where: { userId_planId: { userId: req.userId!, planId: id } },
      update: { rsvp },
      create: { userId: req.userId!, planId: id, rsvp },
    });
    res.json(member);
  } catch (e) {
    res.status(500).json({ error: "Failed to update RSVP" });
  }
});

export default router;
