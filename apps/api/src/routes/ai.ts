import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Google Gemini — free tier. Get a key (no credit card) at:
// https://aistudio.google.com/app/apikey  →  set GEMINI_API_KEY in .env
const GEMINI_MODEL = "gemini-flash-latest";

function aiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

async function getMembership(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
}

type GeminiOpts = {
  system: string;
  prompt: string;
  json?: boolean; // when true, request JSON mime type (parsing done by caller)
};

// Call the Gemini REST API. Returns the raw text of the model's answer.
async function callGemini({ system, prompt, json }: GeminiOpts): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${process.env.GEMINI_API_KEY}`;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      // Keep responses fast: disable the "thinking" step on models that support it
      thinkingConfig: { thinkingBudget: 0 },
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };

  // Try up to 2 times — Gemini's free tier can briefly return 429/503
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (resp.status === 429 || resp.status === 503) {
        lastErr = new Error(`Gemini busy (${resp.status})`);
        await new Promise((r) => setTimeout(r, 1500)); // brief backoff, then retry
        continue;
      }
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        throw new Error(`Gemini ${resp.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await resp.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new Error("Gemini returned no text");
      }
      return text;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr ?? new Error("Gemini request failed");
}

// Extract a JSON object from model text (handles ```json fences and stray prose)
function extractJson(text: string): any {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

// GET /api/ai/selftest — TEMPORARY diagnostic. Reports whether the Gemini key
// works from this server's environment, without ever exposing the key itself.
router.get("/selftest", async (_req: Request, res: Response) => {
  const key = process.env.GEMINI_API_KEY ?? "";
  const meta = {
    configured: !!key,
    keyLength: key.length,
    // surface accidental wrapping/whitespace without revealing the key
    startsWith: key.slice(0, 3),
    hasQuotes: /["']/.test(key),
    hasWhitespace: /\s/.test(key),
    model: GEMINI_MODEL,
  };
  try {
    const text = await callGemini({ system: "Reply with OK.", prompt: "ping" });
    res.json({ ok: true, ...meta, sample: text.slice(0, 40) });
  } catch (e) {
    res.json({ ok: false, ...meta, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
});

// POST /api/ai/packing-list/:planId — generate a tailored packing/shopping list
router.post("/packing-list/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { extra } = req.body as { extra?: string };

  if (!aiConfigured()) {
    return res.status(503).json({ error: "AI is not configured on this server yet" });
  }

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        members: { where: { status: "member" } },
        checkItems: { select: { title: true } },
      },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const existing = plan.checkItems.map((i) => i.title).join(", ") || "none";
    const dateInfo = plan.startDate
      ? `on ${plan.startDate.toISOString().slice(0, 10)}`
      : "date not set";

    const text = await callGemini({
      json: true,
      system:
        "You generate packing/shopping checklists for group plans. " +
        "Be practical and specific to the activity, location, season and group size. " +
        "Never repeat items that already exist on the list. " +
        "Write the items in Spanish if the plan title is in Spanish, otherwise English. " +
        'Respond ONLY with a JSON object of this exact shape: ' +
        '{"items":[{"title":"...","category":"..."}]}',
      prompt:
        `Plan: "${plan.title}"` +
        (plan.description ? `\nDescription: ${plan.description}` : "") +
        (plan.location ? `\nLocation: ${plan.location}` : "") +
        `\nWhen: ${dateInfo}` +
        `\nGroup size: ${plan.members.length} people` +
        `\nItems already on the list: ${existing}` +
        (extra ? `\nExtra context from the user: ${extra}` : "") +
        `\n\nGenerate 10-20 checklist items for this plan as JSON.`,
    });

    const items = extractJson(text).items ?? [];
    res.json({ items });
  } catch (e) {
    console.error("AI packing-list error:", e);
    res.status(500).json({ error: "AI request failed" });
  }
});

// POST /api/ai/assistant/:planId — ask the plan assistant a question
router.post("/assistant/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { question } = req.body as { question?: string };
  if (!question?.trim()) return res.status(400).json({ error: "Question is required" });
  if (question.length > 2000) return res.status(400).json({ error: "Question is too long" });

  if (!aiConfigured()) {
    return res.status(503).json({ error: "AI is not configured on this server yet" });
  }

  try {
    if (!(await getMembership(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        members: { where: { status: "member" }, include: { user: { select: { name: true } } } },
        activities: { orderBy: { order: "asc" } },
        checkItems: true,
        expenses: { include: { payer: { select: { name: true } } } },
      },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const context = [
      `Plan: "${plan.title}"`,
      plan.description ? `Description: ${plan.description}` : null,
      plan.location ? `Location: ${plan.location}` : null,
      plan.startDate ? `Date: ${plan.startDate.toISOString().slice(0, 10)}` : null,
      `Members (${plan.members.length}): ${plan.members.map((m) => m.user.name).join(", ")}`,
      plan.activities.length
        ? `Activities: ${plan.activities.map((a, i) => `${i + 1}. ${a.title}${a.done ? " (done)" : ""}`).join("; ")}`
        : null,
      plan.checkItems.length
        ? `Checklist: ${plan.checkItems.map((c) => `${c.title}${c.checked ? " ✓" : ""}`).join(", ")}`
        : null,
      plan.expenses.length
        ? `Expenses: ${plan.expenses.map((e) => `${e.title} $${e.amount} (paid by ${e.payer.name})`).join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const answer = await callGemini({
      system:
        "You are PlanIt's assistant — a helpful, upbeat companion inside a group-planning mobile app. " +
        "You do TWO things: (1) give practical suggestions about the user's plan, and " +
        "(2) explain how to USE the app when they ask a 'how do I...' question. " +
        "Keep answers short and scannable (this is a mobile app). Reply in the user's language.\n\n" +
        "HOW PLANIT WORKS (use this to answer usage questions):\n" +
        "- Plans are created from the Plans tab (+ New Plan). You invite whole groups and/or individual friends, or share an invite link.\n" +
        "- Groups (Groups tab) are just people + a group chat. You invite friends; they accept the request.\n" +
        "- Friends: Profile → Friends, add by email or username (they accept a request). Friend requests and plan/group invites appear in the 🔔 Notifications screen.\n" +
        "- Inside a plan you add MODULES as tabs with the ＋ button (admin/helpers only): 💸 Split Expenses, 🛒 Packing List, 📋 Activities, 🗳️ Quick Vote, 📸 Gallery, 🎵 Playlist (Spotify/YouTube links), 📎 Files & Notes, 📍 Meetup Tracker (live map).\n" +
        "- 💸 Split Expenses: add a cost, choose who splits it, tap your row when you've paid. 'Everything ÷ everyone' mode splits the grand total evenly.\n" +
        "- 🛒 Packing List: add items, claim them with 'I got it'; the ✨ AI button generates a tailored list.\n" +
        "- 📋 Activities: an ordered list with times; admins/helpers reorder with ▲▼.\n" +
        "- Roles: the plan creator is 👑 admin; admins can make others 🛠️ helpers (who manage modules). Tap 👥 in the plan header to see members and invite friends.\n" +
        "- Plan settings (⚙️ in the header): save the plan as a reusable template, or delete it (admin only).\n" +
        "- 📅 Calendar tab: see your plans and mark your availability (🟢 free / 🟡 maybe / 🔴 busy). The 📅 button inside a plan shows a group availability heatmap with the best dates.\n" +
        "- The 🤖 (this assistant), 📅 (availability) and 👥 (members) buttons live in the plan header.\n" +
        "If asked something unrelated to the plan or the app, answer briefly and steer back to planning.",
      prompt: `Here is the current plan:\n${context}\n\nQuestion: ${question.trim()}`,
    });

    res.json({ answer });
  } catch (e) {
    console.error("AI assistant error:", e);
    res.status(500).json({ error: "AI request failed" });
  }
});

export default router;
