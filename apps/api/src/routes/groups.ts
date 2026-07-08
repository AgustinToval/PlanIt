import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET all groups for current user
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { plans: true } },
      },
    });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// POST create a group
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const { name, description, photo } = req.body as { name: string; description?: string; photo?: string };
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const group = await prisma.group.create({
      data: {
        name,
        description,
        photo,
        members: { create: { userId: req.userId!, role: "admin" } },
      },
      include: { members: { include: { user: true } } },
    });
    res.status(201).json(group);
  } catch (e) {
    res.status(500).json({ error: "Failed to create group" });
  }
});

// GET group by id
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const group = await prisma.group.findFirst({
      where: { id, members: { some: { userId: req.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true, username: true } } } },
        plans: { orderBy: { startDate: "asc" } },
      },
    });
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

// POST join group via invite code
router.post("/join/:inviteCode", authMiddleware, async (req: Request, res: Response) => {
  const inviteCode = String(req.params["inviteCode"]);
  try {
    const group = await prisma.group.findUnique({ where: { inviteCode } });
    if (!group) return res.status(404).json({ error: "Invalid invite link" });

    const existing = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: group.id } },
    });
    if (existing) return res.status(400).json({ error: "Already a member" });

    await prisma.groupMember.create({ data: { userId: req.userId!, groupId: group.id } });
    res.json({ message: "Joined group", group });
  } catch (e) {
    res.status(500).json({ error: "Failed to join group" });
  }
});

// PATCH update group
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { name, description, photo } = req.body as { name?: string; description?: string; photo?: string };
  try {
    const member = await prisma.groupMember.findFirst({
      where: { groupId: id, userId: req.userId, role: "admin" },
    });
    if (!member) return res.status(403).json({ error: "Not authorized" });

    const group = await prisma.group.update({
      where: { id },
      data: { name, description, photo },
    });
    res.json(group);
  } catch (e) {
    res.status(500).json({ error: "Failed to update group" });
  }
});

// POST leave group
router.post("/:id/leave", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: id } },
    });
    if (!membership) return res.status(404).json({ error: "Not a member" });

    await prisma.groupMember.delete({ where: { id: membership.id } });

    const remaining = await prisma.groupMember.count({ where: { groupId: id } });
    if (remaining === 0) {
      // last member left — remove the empty group
      await prisma.group.delete({ where: { id } });
    } else if (membership.role === "admin") {
      // promote the oldest remaining member if no admin is left
      const hasAdmin = await prisma.groupMember.findFirst({ where: { groupId: id, role: "admin" } });
      if (!hasAdmin) {
        const oldest = await prisma.groupMember.findFirst({
          where: { groupId: id },
          orderBy: { joinedAt: "asc" },
        });
        if (oldest) {
          await prisma.groupMember.update({ where: { id: oldest.id }, data: { role: "admin" } });
        }
      }
    }
    res.json({ message: "Left group" });
  } catch (e) {
    res.status(500).json({ error: "Failed to leave group" });
  }
});

// POST mute/unmute group notifications for the current user
router.post("/:id/mute", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { muted } = req.body as { muted: boolean };
  try {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: id } },
    });
    if (!membership) return res.status(404).json({ error: "Not a member" });

    const updated = await prisma.groupMember.update({
      where: { id: membership.id },
      data: { muted: !!muted },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update mute setting" });
  }
});

// DELETE group
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const member = await prisma.groupMember.findFirst({
      where: { groupId: id, userId: req.userId, role: "admin" },
    });
    if (!member) return res.status(403).json({ error: "Not authorized" });

    await prisma.group.delete({ where: { id } });
    res.json({ message: "Group deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete group" });
  }
});

export default router;
