import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const publicUser = { id: true, name: true, username: true, tag: true, avatar: true } as const;

// GET /api/friends — my accepted friends
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ userId: req.userId }, { friendId: req.userId }],
      },
      include: {
        user: { select: publicUser },
        friend: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
    });
    const friends = friendships.map((f) =>
      f.userId === req.userId ? f.friend : f.user
    );
    res.json(friends);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// GET /api/friends/requests — pending requests sent TO me
router.get("/requests", authMiddleware, async (req: Request, res: Response) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { friendId: req.userId, status: "pending" },
      include: { user: { select: publicUser } },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests.map((r) => ({ id: r.id, createdAt: r.createdAt, from: r.user })));
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// POST /api/friends — send a friend request.
// Preferred: { userId } (from search results). Legacy: { query } as email,
// username, or "username#1234".
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const { query, userId } = req.body as { query?: string; userId?: string };
  const q = query?.trim();
  if (!q && !userId) return res.status(400).json({ error: "Enter an email or username" });

  try {
    let target = null;
    if (userId) {
      target = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
    } else if (q) {
      const tagMatch = q.match(/^(.+)#(\d{4})$/);
      target = await prisma.user.findFirst({
        where: tagMatch
          ? { username: tagMatch[1]!.toLowerCase(), tag: tagMatch[2]! }
          : { OR: [{ email: q }, { username: q.toLowerCase() }] },
        select: publicUser,
      });
    }
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
    if (existing) {
      if (existing.status === "accepted") return res.status(409).json({ error: "Already friends" });
      // If THEY already sent me a request, accept it instead of duplicating
      if (existing.friendId === req.userId) {
        await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted" } });
        return res.json({ ...target, autoAccepted: true });
      }
      return res.status(409).json({ error: "Request already sent — waiting for them to accept" });
    }

    await prisma.friendship.create({
      data: { userId: req.userId!, friendId: target.id, status: "pending" },
    });
    res.status(201).json({ ...target, requested: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to send request" });
  }
});

// POST /api/friends/requests/:id/accept
router.post("/requests/:id/accept", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const request = await prisma.friendship.findUnique({ where: { id } });
    if (!request || request.friendId !== req.userId || request.status !== "pending") {
      return res.status(404).json({ error: "Request not found" });
    }
    await prisma.friendship.update({ where: { id }, data: { status: "accepted" } });
    res.json({ message: "Friend request accepted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to accept request" });
  }
});

// POST /api/friends/requests/:id/decline
router.post("/requests/:id/decline", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const request = await prisma.friendship.findUnique({ where: { id } });
    if (!request || request.friendId !== req.userId || request.status !== "pending") {
      return res.status(404).json({ error: "Request not found" });
    }
    await prisma.friendship.delete({ where: { id } });
    res.json({ message: "Request declined" });
  } catch (e) {
    res.status(500).json({ error: "Failed to decline request" });
  }
});

// GET /api/friends/:friendId/profile — public profile of a friend
router.get("/:friendId/profile", authMiddleware, async (req: Request, res: Response) => {
  const friendId = String(req.params["friendId"]);
  try {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "accepted",
        OR: [
          { userId: req.userId, friendId },
          { userId: friendId, friendId: req.userId },
        ],
      },
    });
    if (!friendship) return res.status(403).json({ error: "You can only view friends' profiles" });

    // Privacy: email is never exposed — only the account owner can see it.
    const profile = await prisma.user.findUnique({
      where: { id: friendId },
      select: {
        id: true, name: true, username: true, tag: true, avatar: true,
        bio: true, location: true, createdAt: true,
        _count: { select: { planMembers: true, groupMembers: true, photos: true } },
      },
    });
    if (!profile) return res.status(404).json({ error: "User not found" });
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch profile" });
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
