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

// POST /api/gallery/plan/:planId — add a photo (stored as a data URL or remote URL)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { url, caption } = req.body as { url?: string; caption?: string };
  if (!url) return res.status(400).json({ error: "Image is required" });
  // Guard against oversized payloads (base64 data URLs). ~7MB limit.
  if (url.length > 7_000_000) return res.status(413).json({ error: "Image is too large" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const photo = await prisma.photo.create({
      data: { url, caption: caption?.trim() || null, planId, userId: req.userId! },
      include: { user: { select: { id: true, name: true } } },
    });
    io.to(`plan:${planId}`).emit("gallery:changed", { planId });
    res.status(201).json(photo);
  } catch (e) {
    res.status(500).json({ error: "Failed to add photo" });
  }
});

// GET /api/gallery/plan/:planId — list photos
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const photos = await prisma.photo.findMany({
      where: { planId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(photos);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

// DELETE /api/gallery/:id — uploader or plan admin can delete
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    const membership = await getMembership(req.userId!, photo.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    const isUploader = photo.userId === req.userId;
    const isAdmin = membership.role === "admin";
    if (!isUploader && !isAdmin) {
      return res.status(403).json({ error: "Only the uploader or plan admin can delete this photo" });
    }

    await prisma.photo.delete({ where: { id } });
    io.to(`plan:${photo.planId}`).emit("gallery:changed", { planId: photo.planId });
    res.json({ message: "Photo deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

export default router;
