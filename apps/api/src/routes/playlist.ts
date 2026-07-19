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

function notify(planId: string) {
  io.to(`plan:${planId}`).emit("playlist:changed", { planId });
  void touchPlan(planId, "playlist");
}

// Detect source and derive a title from a pasted link. Spotify & YouTube Music.
function parseLink(url: string): { source: string; guessTitle: string } | null {
  const u = url.trim();
  if (/open\.spotify\.com\/(track|album|playlist)/i.test(u) || /spotify:/.test(u)) {
    return { source: "spotify", guessTitle: "Spotify track" };
  }
  if (/music\.youtube\.com|youtu\.be|youtube\.com\/watch/i.test(u)) {
    return { source: "youtube", guessTitle: "YouTube Music track" };
  }
  return null;
}

type LinkMeta = { title?: string; artist?: string; cover?: string };

// Fetch title/author/cover from the public oEmbed endpoints — no credentials
// needed. Best-effort: on any failure we just return {} and fall back.
async function fetchMeta(url: string, source: string): Promise<LinkMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    let endpoint: string;
    if (source === "spotify") {
      endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    } else {
      // YouTube oEmbed doesn't accept music.youtube.com — normalise to www.
      const normalised = url.replace("music.youtube.com", "www.youtube.com");
      endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(normalised)}`;
    }
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      title?: string; author_name?: string; thumbnail_url?: string;
    };
    return {
      title: data.title?.trim() || undefined,
      // Spotify oEmbed has no separate artist; YouTube gives the channel name
      artist: source === "youtube" ? data.author_name?.trim() || undefined : undefined,
      cover: data.thumbnail_url?.trim() || undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/playlist/plan/:planId — add a song by link (any member)
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { url, title, artist } = req.body as { url?: string; title?: string; artist?: string };
  if (!url?.trim()) return res.status(400).json({ error: "Song link is required" });

  const parsed = parseLink(url);
  if (!parsed) {
    return res.status(400).json({ error: "Paste a Spotify or YouTube Music link" });
  }

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    // Enrich from oEmbed; user-typed values always win over the fetched ones.
    const meta = await fetchMeta(url, parsed.source);
    const song = await prisma.song.create({
      data: {
        title: title?.trim() || meta.title || parsed.guessTitle,
        artist: artist?.trim() || meta.artist || null,
        cover: meta.cover ?? null,
        source: parsed.source,
        url: url.trim(),
        addedBy: req.userId!,
        votes: { [req.userId!]: 1 }, // adding a song counts as an upvote
        planId,
      },
    });
    notify(planId);
    res.status(201).json(song);
  } catch (e) {
    res.status(500).json({ error: "Failed to add song" });
  }
});

// GET /api/playlist/plan/:planId — list songs sorted by score
router.get("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }
    const songs = await prisma.song.findMany({ where: { planId } });
    const withScore = songs.map((s) => {
      const votes = s.votes as Record<string, number>;
      const score = Object.values(votes).reduce((a, b) => a + b, 0);
      return { ...s, score, myVote: votes[req.userId!] ?? 0, voteCount: Object.keys(votes).length };
    });
    withScore.sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime());
    res.json(withScore);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch playlist" });
  }
});

// POST /api/playlist/:id/vote — up (1), down (-1) or clear (0)
router.post("/:id/vote", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const { value } = req.body as { value?: number };
  if (![1, -1, 0].includes(value as number)) {
    return res.status(400).json({ error: "Vote must be 1, -1 or 0" });
  }
  try {
    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ error: "Song not found" });
    if (!(await getMembership(req.userId!, song.planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const votes = { ...(song.votes as Record<string, number>) };
    if (value === 0) delete votes[req.userId!];
    else votes[req.userId!] = value as number;

    await prisma.song.update({ where: { id }, data: { votes } });
    notify(song.planId);
    res.json({ message: "Voted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to vote" });
  }
});

// DELETE /api/playlist/:id — the person who added it or the plan admin
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ error: "Song not found" });

    const membership = await getMembership(req.userId!, song.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });
    if (song.addedBy !== req.userId && membership.role !== "admin") {
      return res.status(403).json({ error: "Only the person who added it or the plan admin can remove it" });
    }

    await prisma.song.delete({ where: { id } });
    notify(song.planId);
    res.json({ message: "Song removed" });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove song" });
  }
});

export default router;
