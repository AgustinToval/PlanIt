import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";
import { sendPushToUsers } from "../lib/push";

const router = Router();

export const MODULE_TYPES = [
  "expenses", "checklist", "activities", "votes",
  "walkietalkie", "gallery", "playlist", "files", "meetup",
] as const;

// Permission helper: returns the ACTIVE member row (joined, not just invited) or null
export async function getPlanMembership(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
}

export function canManage(role: string | undefined): boolean {
  return role === "admin" || role === "helper";
}

// GET my plans (only plans I have actually joined — not pending invites)
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { members: { some: { userId: req.userId, status: "member" } } },
      include: {
        members: {
          where: { status: "member" },
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        modules: { orderBy: { order: "asc" } },
        _count: { select: { messages: true, photos: true, expenses: true } },
      },
      orderBy: { lastActivityAt: "desc" }, // most recent activity first
    });
    res.json(plans);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// GET /api/plans/invitations/mine — pending plan invites for me
router.get("/invitations/mine", authMiddleware, async (req: Request, res: Response) => {
  try {
    const invites = await prisma.planMember.findMany({
      where: { userId: req.userId, status: "invited" },
      include: {
        plan: {
          include: {
            members: { where: { role: "admin" }, include: { user: { select: { id: true, name: true } } } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
    res.json(
      invites.map((i) => ({
        id: i.id,
        plan: {
          id: i.plan.id,
          title: i.plan.title,
          type: i.plan.type,
          startDate: i.plan.startDate,
          location: i.plan.location,
        },
        invitedBy: i.plan.members[0]?.user.name ?? "Someone",
        memberCount: i.plan._count.members,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// POST /api/plans/invitations/:memberId/accept
router.post("/invitations/:memberId/accept", authMiddleware, async (req: Request, res: Response) => {
  const memberId = String(req.params["memberId"]);
  try {
    const membership = await prisma.planMember.findUnique({ where: { id: memberId } });
    if (!membership || membership.userId !== req.userId || membership.status !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }
    await prisma.planMember.update({ where: { id: memberId }, data: { status: "member" } });
    res.json({ message: "Joined plan", planId: membership.planId });
  } catch (e) {
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});

// POST /api/plans/invitations/:memberId/decline
router.post("/invitations/:memberId/decline", authMiddleware, async (req: Request, res: Response) => {
  const memberId = String(req.params["memberId"]);
  try {
    const membership = await prisma.planMember.findUnique({ where: { id: memberId } });
    if (!membership || membership.userId !== req.userId || membership.status !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }
    await prisma.planMember.delete({ where: { id: memberId } });
    res.json({ message: "Invitation declined" });
  } catch (e) {
    res.status(500).json({ error: "Failed to decline invitation" });
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
            { userId: req.userId!, rsvp: "yes", role: "admin", status: "member" },
            ...[...invited].map((userId) => ({ userId, rsvp: "pending", status: "invited" })),
          ],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        modules: true,
      },
    });

    if (invited.size > 0) {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
      void sendPushToUsers(
        [...invited],
        "PlanIt",
        `${me?.name ?? "Alguien"} te invitó a unirte al plan "${plan.title}"`,
        { url: "/notifications" }
      );
    }

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
      where: { id, members: { some: { userId: req.userId, status: "member" } } },
      include: {
        members: { where: { status: "member" }, include: { user: { select: { id: true, name: true, avatar: true, username: true } } } },
        modules: { orderBy: { order: "asc" } },
        activities: { orderBy: { order: "asc" } },
        checkItems: true,
        expenses: { include: { splits: true, payer: { select: { id: true, name: true } } } },
        messages: {
          include: { user: { select: { id: true, name: true, username: true, avatar: true } } },
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

// POST join plan via invite code — immediate (the code is shared deliberately)
router.post("/join/:inviteCode", authMiddleware, async (req: Request, res: Response) => {
  const inviteCode = String(req.params["inviteCode"]);
  try {
    const plan = await prisma.plan.findUnique({ where: { inviteCode } });
    if (!plan) return res.status(404).json({ error: "Invalid invite link" });

    await prisma.planMember.upsert({
      where: { userId_planId: { userId: req.userId!, planId: plan.id } },
      update: { status: "member" }, // accept even if previously just invited
      create: { userId: req.userId!, planId: plan.id, status: "member" },
    });
    res.json({ message: "Joined plan", plan });
  } catch (e) {
    res.status(500).json({ error: "Failed to join plan" });
  }
});

// POST invite more people/groups to an existing plan — sends pending invites
router.post("/:id/invite", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { memberIds, groupIds } = req.body as { memberIds?: string[]; groupIds?: string[] };
  try {
    if (!(await getPlanMembership(req.userId!, id))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const invited = new Set<string>(memberIds ?? []);
    if (groupIds?.length) {
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds }, status: "member", group: { members: { some: { userId: req.userId! } } } },
        select: { userId: true },
      });
      groupMembers.forEach((m) => invited.add(m.userId));
    }
    invited.delete(req.userId!);

    await prisma.planMember.createMany({
      data: [...invited].map((userId) => ({ userId, planId: id, status: "invited" })),
      skipDuplicates: true,
    });

    const plan = await prisma.plan.findUnique({
      where: { id },
      include: { members: { where: { status: "member" }, include: { user: { select: { id: true, name: true } } } } },
    });

    if (invited.size > 0) {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
      void sendPushToUsers(
        [...invited],
        "PlanIt",
        `${me?.name ?? "Alguien"} te invitó a unirte al plan "${plan?.title ?? ""}"`,
        { url: "/notifications" }
      );
    }

    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to invite" });
  }
});

// PATCH update plan (admin/helper only)
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { title, description, startDate, endDate, location, status, bannerImage } = req.body as {
    title?: string; description?: string; startDate?: string;
    endDate?: string; location?: string; status?: string; bannerImage?: string | null;
  };
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the plan admin or helpers can edit the plan" });
    }
    if (typeof bannerImage === "string" && bannerImage.length > 1_500_000) {
      return res.status(400).json({ error: "Banner image is too large" });
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        title, description, location, status,
        // null clears the banner; undefined leaves it untouched
        ...(bannerImage !== undefined ? { bannerImage } : {}),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// POST /api/plans/:id/leave — leave a plan (any member)
router.post("/:id/leave", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const membership = await prisma.planMember.findUnique({
      where: { userId_planId: { userId: req.userId!, planId: id } },
    });
    if (!membership) return res.status(404).json({ error: "You're not in this plan" });

    await prisma.planMember.delete({ where: { id: membership.id } });

    const remaining = await prisma.planMember.count({
      where: { planId: id, status: "member" },
    });
    if (remaining === 0) {
      // last active member left — remove the empty plan
      await prisma.plan.delete({ where: { id } });
    } else if (membership.role === "admin") {
      // promote the oldest remaining member if no admin is left
      const hasAdmin = await prisma.planMember.findFirst({
        where: { planId: id, role: "admin", status: "member" },
      });
      if (!hasAdmin) {
        const oldest = await prisma.planMember.findFirst({
          where: { planId: id, status: "member" },
          orderBy: { joinedAt: "asc" },
        });
        if (oldest) {
          await prisma.planMember.update({ where: { id: oldest.id }, data: { role: "admin" } });
        }
      }
    }
    res.json({ message: "Left plan" });
  } catch (e) {
    res.status(500).json({ error: "Failed to leave plan" });
  }
});

// PATCH /api/plans/templates/:templateId — rename one of my templates
router.patch("/templates/:templateId", authMiddleware, async (req: Request, res: Response) => {
  const templateId = String(req.params["templateId"]);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  try {
    const template = await prisma.planTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.userId !== req.userId) {
      return res.status(404).json({ error: "Template not found" });
    }
    const updated = await prisma.planTemplate.update({
      where: { id: templateId },
      data: { name: name.trim() },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to rename template" });
  }
});

// DELETE /api/plans/:id — delete the whole plan (admin only)
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (membership.role !== "admin") {
      return res.status(403).json({ error: "Only the plan admin can delete the plan" });
    }
    await prisma.plan.delete({ where: { id } });
    res.json({ message: "Plan deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete plan" });
  }
});

// POST /api/plans/:id/save-template — snapshot this plan as a reusable template
router.post("/:id/save-template", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { name } = req.body as { name?: string };
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        modules: { orderBy: { order: "asc" } },
        checkItems: true,
        activities: { orderBy: { order: "asc" } },
      },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const template = await prisma.planTemplate.create({
      data: {
        name: name?.trim() || plan.title,
        userId: req.userId!,
        data: {
          title: plan.title,
          description: plan.description,
          location: plan.location,
          type: plan.type,
          modules: plan.modules.map((m) => m.type),
          checkItems: plan.checkItems.map((c) => ({ title: c.title, category: c.category })),
          activities: plan.activities.map((a) => ({ title: a.title, notes: a.notes })),
        },
      },
    });
    res.status(201).json(template);
  } catch (e) {
    res.status(500).json({ error: "Failed to save template" });
  }
});

// GET /api/plans/templates/mine — my saved templates
router.get("/templates/mine", authMiddleware, async (req: Request, res: Response) => {
  try {
    const templates = await prisma.planTemplate.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// DELETE /api/plans/templates/:templateId — delete one of my templates
router.delete("/templates/:templateId", authMiddleware, async (req: Request, res: Response) => {
  const templateId = String(req.params["templateId"]);
  try {
    const template = await prisma.planTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.userId !== req.userId) {
      return res.status(404).json({ error: "Template not found" });
    }
    await prisma.planTemplate.delete({ where: { id: templateId } });
    res.json({ message: "Template deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// POST /api/plans/templates/:templateId/use — create a new plan from a template
router.post("/templates/:templateId/use", authMiddleware, async (req: Request, res: Response) => {
  const templateId = String(req.params["templateId"]);
  const { title, startDate, endDate, location, memberIds, groupIds } = req.body as {
    title?: string; startDate?: string; endDate?: string; location?: string;
    memberIds?: string[]; groupIds?: string[];
  };
  try {
    const template = await prisma.planTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.userId !== req.userId) {
      return res.status(404).json({ error: "Template not found" });
    }
    const data = template.data as {
      title: string; description: string | null; location: string | null; type: string;
      modules: string[]; checkItems: { title: string; category: string | null }[];
      activities: { title: string; notes: string | null }[];
    };

    // Resolve invitees (same logic as plan creation)
    const invited = new Set<string>(memberIds ?? []);
    if (groupIds?.length) {
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds }, group: { members: { some: { userId: req.userId! } } } },
        select: { userId: true },
      });
      groupMembers.forEach((m) => invited.add(m.userId));
    }
    invited.delete(req.userId!);

    const plan = await prisma.plan.create({
      data: {
        title: title?.trim() || data.title,
        description: data.description,
        location: location ?? data.location,
        type: data.type,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        members: {
          create: [
            { userId: req.userId!, rsvp: "yes", role: "admin" },
            ...[...invited].map((userId) => ({ userId, rsvp: "pending" })),
          ],
        },
        modules: {
          create: data.modules.map((type, i) => ({ type, order: i })),
        },
        checkItems: {
          create: data.checkItems.map((c) => ({ title: c.title, category: c.category })),
        },
        activities: {
          create: data.activities.map((a, i) => ({ title: a.title, notes: a.notes, order: i })),
        },
      },
      include: { members: true, modules: true },
    });
    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ error: "Failed to create plan from template" });
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

// POST /api/plans/:id/seen — mark a module as seen by me (clears its red dot)
router.post("/:id/seen", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { module } = req.body as { module?: string };
  if (!module) return res.status(400).json({ error: "Module is required" });
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    const seen = { ...(membership.moduleSeen as Record<string, string>) };
    seen[module] = new Date().toISOString();
    await prisma.planMember.update({
      where: { id: membership.id },
      data: { moduleSeen: seen },
    });
    res.json({ message: "Seen" });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark seen" });
  }
});

// POST /api/plans/:id/meetup — update my "on the way" status
router.post("/:id/meetup", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { status } = req.body as { status?: string };
  if (!["none", "home", "onway", "there"].includes(status ?? "")) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    await prisma.planMember.update({
      where: { id: membership.id },
      data: { meetupStatus: status! },
    });
    io.to(`plan:${id}`).emit("meetup:changed", { planId: id, userId: req.userId, status });
    res.json({ message: "Status updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// POST /api/plans/:id/location — push my live location (or clear it with null)
router.post("/:id/location", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { lat, lng } = req.body as { lat?: number | null; lng?: number | null };

  const clearing = lat === null || lng === null;
  if (!clearing && (typeof lat !== "number" || typeof lng !== "number" ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  try {
    const membership = await getPlanMembership(req.userId!, id);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    await prisma.planMember.update({
      where: { id: membership.id },
      data: clearing
        ? { lat: null, lng: null, locationAt: null }
        : { lat: lat!, lng: lng!, locationAt: new Date() },
    });
    io.to(`plan:${id}`).emit("location:changed", {
      planId: id,
      userId: req.userId,
      lat: clearing ? null : lat,
      lng: clearing ? null : lng,
      at: clearing ? null : new Date().toISOString(),
    });
    res.json({ message: "Location updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to update location" });
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

    // Whoever adds the walkie talkie is opted in automatically
    if (type === "walkietalkie") {
      await prisma.planMember.update({
        where: { id: membership.id },
        data: { walkieOptIn: "accepted" },
      });
    }

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
