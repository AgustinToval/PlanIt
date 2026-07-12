import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET current user profile
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, email: true, username: true, name: true, avatar: true,
        bio: true, location: true, createdAt: true, updatedAt: true,
        _count: {
          select: {
            planMembers: true,
            groupMembers: true,
            photos: true,
          },
        },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PATCH update current user profile
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
  const { name, username, bio, location, avatar } = req.body;
  try {
    if (username) {
      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: req.userId } },
      });
      if (taken) return res.status(400).json({ error: "Username already taken" });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name, username, bio, location, avatar },
      select: {
        id: true, email: true, username: true, name: true, avatar: true,
        bio: true, location: true, createdAt: true, updatedAt: true,
      },
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /api/users/me/password — change password (requires current password)
router.post("/me/password", authMiddleware, async (req: Request, res: Response) => {
  const { current, next } = req.body as { current?: string; next?: string };
  if (!current || !next) return res.status(400).json({ error: "Current and new password are required" });
  if (next.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.password) return res.status(400).json({ error: "No password set on this account" });

    const ok = await bcrypt.compare(current, user.password);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(next, 10);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hash } });
    res.json({ message: "Password updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to update password" });
  }
});

// GET user by username (public profile)
router.get("/:username", authMiddleware, async (req: Request, res: Response) => {
  const username = String(req.params["username"]);
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        bio: true,
        location: true,
        createdAt: true,
        _count: { select: { planMembers: true, groupMembers: true, photos: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
