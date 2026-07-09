import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";
import { touchPlan } from "../lib/touch";

const router = Router();

async function getMembership(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
}

// GET /api/files/plan/:planId — list files (metadata only, no data payload)
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const files = await prisma.planFile.findMany({
      where: { planId },
      select: { id: true, name: true, mime: true, size: true, addedBy: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// GET /api/files/:id — full file including data
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const file = await prisma.planFile.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ error: "File not found" });
    if (!(await getMembership(req.userId!, file.planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch file" });
  }
});

// POST /api/files/plan/:planId — upload a file (base64 data URL, ~7MB max)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { name, mime, data } = req.body as { name?: string; mime?: string; data?: string };
  if (!name?.trim() || !data) return res.status(400).json({ error: "Name and file data are required" });
  if (data.length > 7_000_000) return res.status(413).json({ error: "File is too large (max ~5MB)" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const file = await prisma.planFile.create({
      data: {
        name: name.trim(),
        mime: mime ?? "application/octet-stream",
        size: Math.round(data.length * 0.75), // approx decoded size
        data,
        addedBy: req.userId!,
        planId,
      },
      select: { id: true, name: true, mime: true, size: true, addedBy: true, createdAt: true },
    });
    io.to(`plan:${planId}`).emit("files:changed", { planId });
    void touchPlan(planId, "files");
    res.status(201).json(file);
  } catch (e) {
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// DELETE /api/files/:id — uploader or plan admin
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const file = await prisma.planFile.findUnique({ where: { id }, select: { id: true, planId: true, addedBy: true } });
    if (!file) return res.status(404).json({ error: "File not found" });

    const membership = await getMembership(req.userId!, file.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (file.addedBy !== req.userId && membership.role !== "admin") {
      return res.status(403).json({ error: "Only the uploader or plan admin can delete this file" });
    }

    await prisma.planFile.delete({ where: { id } });
    io.to(`plan:${file.planId}`).emit("files:changed", { planId: file.planId });
    void touchPlan(file.planId, "files");
    res.json({ message: "File deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// --- Shared notes ---

// GET /api/files/plan/:planId/notes
router.get("/plan/:planId/notes", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { notes: true } });
    res.json({ notes: plan?.notes ?? "" });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// PUT /api/files/plan/:planId/notes — save shared notes (any member)
router.put("/plan/:planId/notes", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { notes } = req.body as { notes?: string };
  if (typeof notes !== "string") return res.status(400).json({ error: "Notes must be text" });
  if (notes.length > 20_000) return res.status(413).json({ error: "Notes are too long" });

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    await prisma.plan.update({ where: { id: planId }, data: { notes } });
    io.to(`plan:${planId}`).emit("notes:changed", { planId, notes, by: req.userId });
    void touchPlan(planId, "files");
    res.json({ message: "Notes saved" });
  } catch (e) {
    res.status(500).json({ error: "Failed to save notes" });
  }
});

export default router;
