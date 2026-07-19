import { Router, Request, Response } from "express";
import { randomInt } from "crypto";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";
import { touchPlan } from "../lib/touch";

const router = Router();

type Participant = { id: string; name: string };

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
  io.to(`plan:${planId}`).emit("raffle:changed", { planId });
  void touchPlan(planId, "raffle");
}

// Sanitize a participants payload: [{ id, name }], 2-30 entries, unique ids
function cleanParticipants(input: unknown): Participant[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: Participant[] = [];
  for (const p of input) {
    const id = typeof p?.id === "string" ? p.id.trim() : "";
    const name = typeof p?.name === "string" ? p.name.trim().slice(0, 30) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.length >= 2 && out.length <= 30 ? out : null;
}

// GET /api/raffles/plan/:planId — list raffles (any member)
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const raffles = await prisma.raffle.findMany({
      where: { planId },
      orderBy: { createdAt: "desc" },
    });
    res.json(raffles);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch raffles" });
  }
});

// POST /api/raffles/plan/:planId — create a raffle (admin or helper)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { title, participants } = req.body as { title?: string; participants?: unknown };
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  const clean = cleanParticipants(participants);
  if (!clean) return res.status(400).json({ error: "Pick between 2 and 30 participants" });

  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (!canManage(membership.role)) {
      return res.status(403).json({ error: "Only the admin or helpers can create raffles" });
    }

    const raffle = await prisma.raffle.create({
      data: {
        title: title.trim().slice(0, 60),
        participants: clean,
        createdBy: req.userId!,
        planId,
      },
    });
    notify(planId);
    res.status(201).json(raffle);
  } catch (e) {
    res.status(500).json({ error: "Failed to create raffle" });
  }
});

// PATCH /api/raffles/:id — edit title/participants (admin or helper).
// Changing the lineup clears the previous result so it can't mislead.
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { title, participants } = req.body as { title?: string; participants?: unknown };

  try {
    const raffle = await prisma.raffle.findUnique({ where: { id } });
    if (!raffle) return res.status(404).json({ error: "Raffle not found" });

    const membership = await getMembership(req.userId!, raffle.planId);
    if (!membership || !canManage(membership.role)) {
      return res.status(403).json({ error: "Only the admin or helpers can edit raffles" });
    }

    const data: { title?: string; participants?: Participant[]; winnerId?: null; winnerName?: null; spunAt?: null } = {};
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: "Title is required" });
      data.title = title.trim().slice(0, 60);
    }
    if (participants !== undefined) {
      const clean = cleanParticipants(participants);
      if (!clean) return res.status(400).json({ error: "Pick between 2 and 30 participants" });
      data.participants = clean;
      data.winnerId = null;
      data.winnerName = null;
      data.spunAt = null;
    }

    const updated = await prisma.raffle.update({ where: { id }, data });
    notify(raffle.planId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update raffle" });
  }
});

// POST /api/raffles/:id/spin — pick a random winner server-side (admin/helper).
// The result is broadcast so everyone watches the same wheel land together.
router.post("/:id/spin", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const raffle = await prisma.raffle.findUnique({ where: { id } });
    if (!raffle) return res.status(404).json({ error: "Raffle not found" });

    const membership = await getMembership(req.userId!, raffle.planId);
    if (!membership || !canManage(membership.role)) {
      return res.status(403).json({ error: "Only the admin or helpers can spin" });
    }

    const participants = raffle.participants as Participant[];
    if (participants.length < 2) return res.status(400).json({ error: "Not enough participants" });

    const winnerIndex = randomInt(participants.length); // crypto-grade fairness
    const winner = participants[winnerIndex]!;

    const updated = await prisma.raffle.update({
      where: { id },
      data: { winnerId: winner.id, winnerName: winner.name, spunAt: new Date() },
    });

    io.to(`plan:${raffle.planId}`).emit("raffle:spun", {
      raffleId: id,
      winnerIndex,
      winnerId: winner.id,
      winnerName: winner.name,
    });
    void touchPlan(raffle.planId, "raffle");
    res.json({ ...updated, winnerIndex });
  } catch (e) {
    res.status(500).json({ error: "Failed to spin" });
  }
});

// DELETE /api/raffles/:id — admin or helper
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const raffle = await prisma.raffle.findUnique({ where: { id } });
    if (!raffle) return res.status(404).json({ error: "Raffle not found" });

    const membership = await getMembership(req.userId!, raffle.planId);
    if (!membership || !canManage(membership.role)) {
      return res.status(403).json({ error: "Only the admin or helpers can delete raffles" });
    }

    await prisma.raffle.delete({ where: { id } });
    notify(raffle.planId);
    res.json({ message: "Raffle deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete raffle" });
  }
});

export default router;
