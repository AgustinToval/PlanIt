import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const publicUser = { id: true, name: true, username: true, avatar: true } as const;

// GET /api/friends — my friends list
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userId: req.userId }, { friendId: req.userId }] },
      include: {
        user: { select: publicUser },
        friend: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
    });
    // return "the other person" of each friendship
    const friends = friendships.map((f) =>
      f.userId === req.userId ? f.friend : f.user
    );
    res.json(friends);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// POST /api/friends — add a friend by email or username
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const { query } = req.body as { query?: string };
  const q = query?.trim();
  if (!q) return res.status(400).json({ error: "Enter an email or username" });

  try {
    const target = await prisma.user.findFirst({
      where: { OR: [{ email: q }, { username: q }] },
      select: publicUser,
    });
    if (!target) return res.status(404).json({ error: "No user found with that email or username" });
    if (target.id === req.userId) return res.status(400).json({ error: "That's you 🙃" });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: req.userId, friendId: target.id },
          { userId: target.id, friendId: req.userId },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: "Already friends" });

    await prisma.friendship.create({
      data: { userId: req.userId!, friendId: target.id },
    });
    res.status(201).json(target);
  } catch (e) {
    res.status(500).json({ error: "Failed to add friend" });
  }
});

// DELETE /api/friends/:friendId — remove a friend
router.delete("/:friendId", authMiddleware, async (req: Request, res: Response) => {
  const friendId = String(req.params["friendId"]);
  try {
    const result = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: req.userId, friendId },
          { userId: friendId, friendId: req.userId },
        ],
      },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not friends" });
    res.json({ message: "Friend removed" });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

export default router;
