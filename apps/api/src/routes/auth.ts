import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";

const router = Router();

// POST /api/auth/google — exchange Google token for app JWT
router.post("/google", async (req: Request, res: Response) => {
  const { googleId, email, name, avatar } = req.body;
  if (!googleId || !email) return res.status(400).json({ error: "Missing fields" });

  try {
    let user = await prisma.user.findFirst({
      where: {
        accounts: { some: { provider: "google", providerAccountId: googleId } },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          accounts: {
            create: { provider: "google", providerAccountId: googleId },
          },
        },
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "30d",
    });

    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: "Auth failed" });
  }
});

export default router;
