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

// POST /api/voice/plan/:planId/optin — accept or decline the walkie channel
router.post("/plan/:planId/optin", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { accept } = req.body as { accept?: boolean };
  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    const updated = await prisma.planMember.update({
      where: { id: membership.id },
      data: { walkieOptIn: accept ? "accepted" : "declined" },
    });
    res.json({ walkieOptIn: updated.walkieOptIn });
  } catch (e) {
    res.status(500).json({ error: "Failed to update walkie status" });
  }
});

// GET /api/voice/plan/:planId/status — my opt-in status for this plan's walkie
router.get("/plan/:planId/status", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    res.json({ walkieOptIn: membership.walkieOptIn });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// POST /api/voice/plan/:planId — send a voice clip (base64 audio data URL)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { url, duration } = req.body as { url?: string; duration?: number };
  if (!url) return res.status(400).json({ error: "Audio is required" });
  if (url.length > 8_000_000) return res.status(413).json({ error: "Clip is too long" });

  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    if (membership.walkieOptIn !== "accepted") {
      return res.status(403).json({ error: "Join the walkie talkie first" });
    }

    const clip = await prisma.voiceClip.create({
      data: {
        url,
        duration: typeof duration === "number" ? duration : 0,
        planId,
        userId: req.userId!,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    // Bound storage: keep only the last 30 clips per plan, and nothing older
    // than 48h (walkie audio is ephemeral by nature).
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const old = await prisma.voiceClip.findMany({
      where: { planId },
      orderBy: { createdAt: "desc" },
      skip: 30,
      select: { id: true },
    });
    await prisma.voiceClip.deleteMany({
      where: {
        OR: [
          ...(old.length ? [{ id: { in: old.map((c) => c.id) } }] : []),
          { planId, createdAt: { lt: cutoff } },
        ],
      },
    });

    // Notify everyone (metadata only — clients fetch the audio to play it)
    io.to(`plan:${planId}`).emit("voice:new", {
      id: clip.id,
      userId: clip.userId,
      name: clip.user.name,
      duration: clip.duration,
      createdAt: clip.createdAt,
    });

    res.status(201).json({ id: clip.id });
  } catch (e) {
    res.status(500).json({ error: "Failed to send voice clip" });
  }
});

// GET /api/voice/plan/:planId — list recent clips (metadata only)
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    const membership = await getMembership(req.userId!, planId);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    if (membership.walkieOptIn !== "accepted") {
      return res.status(403).json({ error: "Join the walkie talkie first" });
    }
    const clips = await prisma.voiceClip.findMany({
      where: { planId },
      select: {
        id: true, duration: true, userId: true, createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    res.json(
      clips.map((c) => ({
        id: c.id, userId: c.userId, name: c.user.name,
        duration: c.duration, createdAt: c.createdAt,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// GET /api/voice/:id — fetch the audio of one clip
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const clip = await prisma.voiceClip.findUnique({ where: { id } });
    if (!clip) return res.status(404).json({ error: "Clip not found" });
    const membership = await getMembership(req.userId!, clip.planId);
    if (!membership || membership.walkieOptIn !== "accepted") {
      return res.status(403).json({ error: "Join the walkie talkie first" });
    }
    res.json({ id: clip.id, url: clip.url, duration: clip.duration });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch clip" });
  }
});

// DELETE /api/voice/:id — the sender or the plan admin can delete a clip
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const clip = await prisma.voiceClip.findUnique({
      where: { id },
      select: { id: true, planId: true, userId: true },
    });
    if (!clip) return res.status(404).json({ error: "Clip not found" });

    const membership = await getMembership(req.userId!, clip.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (clip.userId !== req.userId && membership.role !== "admin") {
      return res.status(403).json({ error: "Only the sender or the plan admin can delete it" });
    }

    await prisma.voiceClip.delete({ where: { id } });
    io.to(`plan:${clip.planId}`).emit("voice:deleted", { id: clip.id, planId: clip.planId });
    res.json({ message: "Clip deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete clip" });
  }
});

export default router;
