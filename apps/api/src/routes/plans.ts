import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

export const MODULE_TYPES = [
  "expenses", "checklist", "activities", "votes",
  "walkietalkie", "gallery", "playlist", "files", "meetup",
] as const;

// Permission helper: returns the member row or null
export async function getPlanMembership(userId: string, planId: string) {
  return prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
}

export function canManage(role: string | undefined): boolean {
  return role === "admin" || role === "helper";
}

// GET my plans (all plans I'm a member of)
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        modules: { orderBy: { order: "asc" } },
        _count: { select: { messages: true, photos: true, expenses: true } },
      },
      orderBy: { startDate: "asc" },
    });
    res.json(plans);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// POST create a plan — invite individual users and/or whole groups
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const { title, description, type, startDate, endDate, location, memberIds, groupIds } = req.body as {
    title: string;
    description?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    memberIds?: string[];
    groupIds?: string[];
  };
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    // Collect all invited user ids: direct members + every member of the selected groups
    const invited = new Set<string>(memberIds ?? []);
    if (groupIds?.length) {
      const groupMembers = await prisma.groupMember.findMany({
        where: {
          groupId: { in: groupIds },
          // only groups the creator belongs to
          group: { members: { some: { userId: req.userId! } } },
        },
        select: { userId: true },
      });
      groupMembers.forEach((m) => invited.add(m.userId));
    }
    invited.delete(req.userId!); // creator is added separately with rsvp yes

    const plan = await prisma.plan.create({
      data: {
        title,
        description,
        type: type ?? "full",
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        location,
        members: {
          create: [
            { userId: req.userId!, rsvp: "yes", role: "admin" },
            ...[...invited].map((userId) => ({ userId, rsvp: "pending" })),
          ],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        modules: true,
      },
    });
    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// GET plan by id (must be a member)
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const plan = await prisma.plan.findFirst({
      where: { id, members: { some: { userId: req.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true, username: true } } } },
        modules: { orderBy: { order: "asc" } },
        activities: { orderBy: { order: "asc" } },
        checkItems: true,
        expenses: { include: { splits: true, payer: { select: { id: true, name: true } } } },
        messages: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          take: 100,
          orderBy: { createdAt: "asc" },
        },
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

    await prisma.planMember.upsert({
      where: { userId_planId: { userId: req.userId!, planId: plan.id } },
      update: {},
      create: { userId: req.userId!, planId: plan.id },
    });
    res.json({ message: "Joined plan", plan });
  } catch (e) {
    res.status(500).json({ error: "Failed to join plan" });
  }
});

// POST invite more people/groups to an existing plan
router.post("/:id/invite", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { memberIds, groupIds } = req.body as { memberIds?: string[]; groupIds?: string[] };
  try {
    const isMember = await prisma.planMember.findUnique({
      where: { userId_planId: { userId: req.userId!, planId: id } },
    });
    if (!isMember) return res.status(403).json({ error: "Not a member of this plan" });

    const invited = new Set<string>(memberIds ?? []);
    if (groupIds?.length) {
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds }, group: { members: { some: { userId: req.userId! } } } },
        select: { userId: true },
      });
      groupMembers.forEach((m) => invited.add(m.userId));
    }

    await prisma.planMember.createMany({
      data: [...invited].map((userId) => ({ userId, planId: id })),
      skipDuplicates: true,
    });

    const plan = await prisma.plan.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to invite" });
  }
});

// PATCH update plan (admin/helper only)
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { title, description, startDate, endDate, location, status } = req.body as {
    title?: string; description?: string; startDate?: string;
    endDate?: string; location?: string; status?: string;
  };
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can edit the plan" });
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        title, description, location, status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// POST set a member's role (admin only). Roles: helper | member
router.post("/:id/members/:userId/role", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const targetUserId = String(req.params["userId"]);
  const { role } = req.body as { role: string };
  if (!["helper", "member"].includes(role)) {
    return res.status(400).json({ error: "Role must be helper or member" });
  }
  try {
    const me = await getPlanMembership(req.userId!, id);
    if (me?.role !== "admin") {
      return res.status(403).json({ error: "Only the plan admin can change roles" });
    }
    if (targetUserId === req.userId) {
      return res.status(400).json({ error: "You are the admin — you cannot demote yourself" });
    }

    const target = await getPlanMembership(targetUserId, id);
    if (!target) return res.status(404).json({ error: "That user is not in this plan" });

    const updated = await prisma.planMember.update({
      where: { id: target.id },
      data: { role },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update role" });
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

// POST add a module to a plan (admin/helper only)
router.post("/:id/modules", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { type } = req.body as { type: string };
  if (!MODULE_TYPES.includes(type as any)) {
    return res.status(400).json({ error: "Invalid module type" });
  }
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can manage modules" });
    }

    const count = await prisma.planModule.count({ where: { planId: id } });
    const module = await prisma.planModule.upsert({
      where: { planId_type: { planId: id, type } },
      update: {},
      create: { planId: id, type, order: count },
    });
    res.status(201).json(module);
  } catch (e) {
    res.status(500).json({ error: "Failed to add module" });
  }
});

// DELETE remove a module from a plan (admin/helper only)
router.delete("/:id/modules/:type", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const type = String(req.params["type"]);
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can manage modules" });
    }

    await prisma.planModule.delete({ where: { planId_type: { planId: id, type } } });
    res.json({ message: "Module removed" });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove module" });
  }
});

export default router;
