import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/availability/mine?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/mine", authMiddleware, async (req: Request, res: Response) => {
  const from = String(req.query["from"] ?? "");
  const to = String(req.query["to"] ?? "");
  try {
    const entries = await prisma.availability.findMany({
      where: {
        userId: req.userId,
        ...(DATE_RE.test(from) && DATE_RE.test(to) ? { date: { gte: from, lte: to } } : {}),
      },
      select: { date: true, status: true },
    });
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

// PUT /api/availability/mine — set one day: { date, status } (status "none" clears it)
router.put("/mine", authMiddleware, async (req: Request, res: Response) => {
  const { date, status } = req.body as { date?: string; status?: string };
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  if (!["free", "maybe", "busy", "none"].includes(status ?? "")) {
    return res.status(400).json({ error: "Status must be free, maybe, busy or none" });
  }

  try {
    if (status === "none") {
      await prisma.availability.deleteMany({ where: { userId: req.userId!, date } });
      return res.json({ date, status: "none" });
    }
    const entry = await prisma.availability.upsert({
      where: { userId_date: { userId: req.userId!, date } },
      update: { status: status! },
      create: { userId: req.userId!, date, status: status! },
    });
    res.json({ date: entry.date, status: entry.status });
  } catch (e) {
    res.status(500).json({ error: "Failed to save availability" });
  }
});

// GET /api/availability/plan/:planId?from&to — availability of every plan member
// (used for the group heatmap and smart date suggestions)
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const from = String(req.query["from"] ?? "");
  const to = String(req.query["to"] ?? "");
  try {
    const me = await prisma.planMember.findUnique({
      where: { userId_planId: { userId: req.userId!, planId } },
    });
    if (!me || me.status !== "member") return res.status(403).json({ error: "Not a member of this plan" });

    const members = await prisma.planMember.findMany({
      where: { planId, status: "member" },
      include: { user: { select: { id: true, name: true } } },
    });
    const userIds = members.map((m) => m.userId);

    const entries = await prisma.availability.findMany({
      where: {
        userId: { in: userIds },
        ...(DATE_RE.test(from) && DATE_RE.test(to) ? { date: { gte: from, lte: to } } : {}),
      },
      select: { userId: true, date: true, status: true },
    });

    res.json({
      members: members.map((m) => ({ id: m.userId, name: m.user.name })),
      entries,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch plan availability" });
  }
});

export default router;
