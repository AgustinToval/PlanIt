import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { sendPushToUsers } from "../lib/push";

const router = Router();

// GET groups I've joined (not pending invites)
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.userId, status: "member" } } },
      include: {
        members: {
          where: { status: "member" },
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        _count: { select: { plans: true } },
      },
      orderBy: { lastActivityAt: "desc" }, // most recent chat activity first
    });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// GET /api/groups/invitations/mine — pending group invites for me
router.get("/invitations/mine", authMiddleware, async (req: Request, res: Response) => {
  try {
    const invites = await prisma.groupMember.findMany({
      where: { userId: req.userId, status: "invited" },
      include: {
        group: {
          include: {
            members: { where: { role: "admin" }, include: { user: { select: { name: true } } } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
    res.json(
      invites.map((i) => ({
        id: i.id,
        group: { id: i.group.id, name: i.group.name, description: i.group.description },
        invitedBy: i.group.members[0]?.user.name ?? "Someone",
        memberCount: i.group._count.members,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// POST /api/groups/:id/invite — invite friends to a group (pending)
router.post("/:id/invite", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { memberIds } = req.body as { memberIds?: string[] };
  try {
    const me = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: id } },
    });
    if (!me || me.status !== "member") return res.status(403).json({ error: "Not a member of this group" });

    const invited = (memberIds ?? []).filter((uid) => uid !== req.userId);
    await prisma.groupMember.createMany({
      data: invited.map((userId) => ({ userId, groupId: id, status: "invited" })),
      skipDuplicates: true,
    });

    if (invited.length > 0) {
      const [sender, group] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } }),
        prisma.group.findUnique({ where: { id }, select: { name: true } }),
      ]);
      void sendPushToUsers(
        invited,
        "PlanIt",
        `${sender?.name ?? "Alguien"} te invitó al grupo "${group?.name ?? ""}"`,
        { url: "/notifications" }
      );
    }

    res.json({ message: "Invitations sent" });
  } catch (e) {
    res.status(500).json({ error: "Failed to invite" });
  }
});

// POST /api/groups/invitations/:memberId/accept
router.post("/invitations/:memberId/accept", authMiddleware, async (req: Request, res: Response) => {
  const memberId = String(req.params["memberId"]);
  try {
    const membership = await prisma.groupMember.findUnique({ where: { id: memberId } });
    if (!membership || membership.userId !== req.userId || membership.status !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }
    await prisma.groupMember.update({ where: { id: memberId }, data: { status: "member" } });
    res.json({ message: "Joined group", groupId: membership.groupId });
  } catch (e) {
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});

// POST /api/groups/invitations/:memberId/decline
router.post("/invitations/:memberId/decline", authMiddleware, async (req: Request, res: Response) => {
  const memberId = String(req.params["memberId"]);
  try {
    const membership = await prisma.groupMember.findUnique({ where: { id: memberId } });
    if (!membership || membership.userId !== req.userId || membership.status !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }
    await prisma.groupMember.delete({ where: { id: memberId } });
    res.json({ message: "Invitation declined" });
  } catch (e) {
    res.status(500).json({ error: "Failed to decline invitation" });
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
        members: { create: { userId: req.userId!, role: "admin", status: "member" } },
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
      where: { id, members: { some: { userId: req.userId, status: "member" } } },
      include: {
        members: { where: { status: "member" }, include: { user: { select: { id: true, name: true, avatar: true, username: true } } } },
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
    if (existing?.status === "member") return res.status(400).json({ error: "Already a member" });

    await prisma.groupMember.upsert({
      where: { userId_groupId: { userId: req.userId!, groupId: group.id } },
      update: { status: "member" },
      create: { userId: req.userId!, groupId: group.id, status: "member" },
    });
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

// POST /api/groups/:id/seen — mark the group chat as seen by me
router.post("/:id/seen", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: id } },
    });
    if (!membership || membership.status !== "member") {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    await prisma.groupMember.update({
      where: { id: membership.id },
      data: { lastSeenAt: new Date() },
    });
    res.json({ message: "Seen" });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark seen" });
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
