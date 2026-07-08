import { Router, Request, Response } from "express";
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
