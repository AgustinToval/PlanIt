import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router = Router();

function issueToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "30d" });
}

function sanitize(user: { password?: string | null } & Record<string, unknown>) {
  const { password, ...safe } = user;
  return safe;
}

export function randomTag(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// POST /api/auth/register — email + password signup
router.post("/register", async (req: Request, res: Response) => {
  const { email, name, password } = req.body as { email?: string; name?: string; password?: string };
  if (!email || !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: "Valid email is required" });
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    const hash = await bcrypt.hash(password, 10);

    if (existing) {
      if (existing.password) {
        return res.status(409).json({ error: "This email is already registered — log in instead" });
      }
      // Account created before passwords existed (dev login era): claim it.
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { password: hash, name: existing.name ?? name.trim() },
      });
      return res.json({ token: issueToken(user.id), user: sanitize(user) });
    }

    const user = await prisma.user.create({
      data: { email, name: name.trim(), password: hash, tag: randomTag() },
    });
    res.status(201).json({ token: issueToken(user.id), user: sanitize(user) });
  } catch (e) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login — email + password login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    res.json({ token: issueToken(user.id), user: sanitize(user) });
  } catch (e) {
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/google — exchange verified Google identity for app JWT.
// Will be wired to real Google token verification when native builds land.
router.post("/google", async (req: Request, res: Response) => {
  res.status(501).json({ error: "Google Sign-In arrives with the native build" });
});

export default router;
