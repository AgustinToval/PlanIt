import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { randomTag } from "./auth";

const router = Router();

// GET current user profile
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, email: true, username: true, tag: true, name: true, avatar: true,
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

// PATCH update current user profile.
// Usernames are NOT globally unique — the (username, tag) pair is. If the new
// username collides with my current tag, a fresh tag is assigned automatically.
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
  const { name, username, bio, location, avatar } = req.body;
  try {
    let tag: string | undefined;
    if (username) {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { tag: true } });
      tag = me?.tag ?? randomTag();
      for (let attempt = 0; attempt < 15; attempt++) {
        const clash = await prisma.user.findFirst({
          where: { username, tag, NOT: { id: req.userId } },
          select: { id: true },
        });
        if (!clash) break;
        tag = randomTag();
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name, username, bio, location, avatar, ...(tag ? { tag } : {}) },
      select: {
        id: true, email: true, username: true, tag: true, name: true, avatar: true,
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

// GET /api/users/search?q= — find people by username (or exact email).
// NEVER returns email addresses: only public profile fields.
router.get("/search", authMiddleware, async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (q.length < 2) return res.json([]);

  try {
    // "agus#4821" → exact username + tag lookup
    const tagMatch = q.match(/^(.+)#(\d{4})$/);
    const isEmail = /\S+@\S+\.\S+/.test(q);

    const users = await prisma.user.findMany({
      where: {
        NOT: { id: req.userId },
        ...(tagMatch
          ? { username: tagMatch[1]!.toLowerCase(), tag: tagMatch[2]! }
          : isEmail
            ? { email: q }
            : {
                OR: [
                  { username: { contains: q.toLowerCase() } },
                  { name: { contains: q, mode: "insensitive" } },
                ],
              }),
      },
      select: { id: true, name: true, username: true, tag: true, avatar: true, bio: true },
      take: 10,
      orderBy: { username: "asc" },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Search failed" });
  }
});

// GET user by username (public profile) — first match; disambiguate with ?tag=
router.get("/:username", authMiddleware, async (req: Request, res: Response) => {
  const username = String(req.params["username"]);
  const tag = req.query["tag"] ? String(req.query["tag"]) : undefined;
  try {
    const user = await prisma.user.findFirst({
      where: { username, ...(tag ? { tag } : {}) },
      select: {
        id: true,
        name: true,
        username: true,
        tag: true,
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
