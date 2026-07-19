import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

const router = Router();

// Verifies Google ID tokens. GOOGLE_CLIENT_IDS = comma-separated list of the
// web + iOS OAuth client IDs (the audiences the token can have).
const googleClient = new OAuth2Client();
const GOOGLE_AUDIENCES = (process.env.GOOGLE_CLIENT_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function issueToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "30d" });
}

// Build a unique username#tag from a Google email prefix
async function uniqueUsernameFrom(email: string): Promise<{ username: string; tag: string }> {
  let base = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 18);
  if (base.length < 3) base = `${base}user`;
  let tag = randomTag();
  for (let i = 0; i < 25; i++) {
    const clash = await prisma.user.findFirst({ where: { username: base, tag }, select: { id: true } });
    if (!clash) break;
    tag = randomTag();
  }
  return { username: base, tag };
}

function sanitize(user: { password?: string | null } & Record<string, unknown>) {
  const { password, ...safe } = user;
  return safe;
}

export function randomTag(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// POST /api/auth/register — email + password signup. Username is REQUIRED:
// everyone starts with their username#tag identity already created.
router.post("/register", async (req: Request, res: Response) => {
  const { email, name, password, username } = req.body as {
    email?: string; name?: string; password?: string; username?: string;
  };
  if (!email || !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: "Valid email is required" });
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

  const cleanUsername = username?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({ error: "Username must be 3-20 characters (letters, numbers, _ or .)" });
  }

  try {
    // One email = one account. If it already exists (via password OR Google),
    // registration is refused — this prevents someone from claiming a
    // Google-only account by setting a password on it.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const error = existing.password
        ? "This email is already registered — log in instead"
        : "This email is already linked to a Google account — use Continue with Google";
      return res.status(409).json({ error });
    }

    const hash = await bcrypt.hash(password, 10);

    // Pick a tag that doesn't collide with this username
    let tag = randomTag();
    for (let attempt = 0; attempt < 15; attempt++) {
      const clash = await prisma.user.findFirst({
        where: { username: cleanUsername, tag },
        select: { id: true },
      });
      if (!clash) break;
      tag = randomTag();
    }

    const user = await prisma.user.create({
      data: { email, name: name.trim(), password: hash, username: cleanUsername, tag },
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

// POST /api/auth/google — verify a Google ID token and issue our app JWT.
// New Google users get an account auto-created with a username#tag they can
// change later. Existing users (same email) just get logged in.
router.post("/google", async (req: Request, res: Response) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) return res.status(400).json({ error: "Missing Google token" });
  if (GOOGLE_AUDIENCES.length === 0) {
    return res.status(500).json({ error: "Google Sign-In is not configured on the server" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_AUDIENCES });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.email_verified) {
      return res.status(401).json({ error: "Google account email not verified" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const { username, tag } = await uniqueUsernameFrom(email);
      user = await prisma.user.create({
        data: {
          email,
          name: payload.name ?? email.split("@")[0]!,
          username,
          tag,
          avatar: payload.picture ?? null,
        },
      });
    }
    res.json({ token: issueToken(user.id), user: sanitize(user) });
  } catch (e) {
    res.status(401).json({ error: "Could not verify Google sign-in" });
  }
});

export default router;
