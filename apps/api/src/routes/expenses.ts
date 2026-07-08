import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";

const router = Router();

async function assertPlanMember(userId: string, planId: string) {
  return prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
}

// POST /api/expenses/plan/:planId — add an expense, split equally
router.post("/plan/:planId", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const { title, amount, category, splitBetween } = req.body as {
    title: string;
    amount: number;
    category?: string;
    splitBetween?: string[]; // user ids sharing the cost; defaults to all plan members
  };
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

  try {
    if (!(await assertPlanMember(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    // Determine who shares this expense
    let sharerIds: string[];
    if (splitBetween?.length) {
      const valid = await prisma.planMember.findMany({
        where: { planId, userId: { in: splitBetween } },
        select: { userId: true },
      });
      sharerIds = valid.map((m) => m.userId);
    } else {
      const all = await prisma.planMember.findMany({
        where: { planId },
        select: { userId: true },
      });
      sharerIds = all.map((m) => m.userId);
    }
    if (sharerIds.length === 0) return res.status(400).json({ error: "No one to split with" });

    // Equal split, cent-accurate: distribute the remainder cent by cent
    const cents = Math.round(value * 100);
    const base = Math.floor(cents / sharerIds.length);
    const remainder = cents - base * sharerIds.length;

    const expense = await prisma.expense.create({
      data: {
        title: title.trim(),
        amount: value,
        category,
        planId,
        paidBy: req.userId!,
        splits: {
          create: sharerIds.map((userId, i) => ({
            userId,
            amount: (base + (i < remainder ? 1 : 0)) / 100,
            settled: userId === req.userId, // your own share is settled by definition
          })),
        },
      },
      include: {
        splits: true,
        payer: { select: { id: true, name: true } },
      },
    });

    io.to(`plan:${planId}`).emit("expense:added", expense);
    res.status(201).json(expense);
  } catch (e) {
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// GET /api/expenses/plan/:planId/summary — balances + minimal settlement plan
router.get("/plan/:planId/summary", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  try {
    if (!(await assertPlanMember(req.userId!, planId))) {
      return res.status(403).json({ error: "Not a member of this plan" });
    }

    const expenses = await prisma.expense.findMany({
      where: { planId },
      include: { splits: true },
    });
    const members = await prisma.planMember.findMany({
      where: { planId },
      include: { user: { select: { id: true, name: true } } },
    });

    // net (cents): positive = is owed money, negative = owes money
    const net = new Map<string, number>();
    members.forEach((m) => net.set(m.userId, 0));

    for (const exp of expenses) {
      const cents = Math.round(exp.amount * 100);
      net.set(exp.paidBy, (net.get(exp.paidBy) ?? 0) + cents);
      for (const split of exp.splits) {
        net.set(split.userId, (net.get(split.userId) ?? 0) - Math.round(split.amount * 100));
      }
    }

    // Greedy minimal transactions
    const debtors = [...net.entries()].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    const creditors = [...net.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);

    const transactions: { from: string; to: string; amount: number }[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i]!.v, creditors[j]!.v);
      if (pay > 0) {
        transactions.push({ from: debtors[i]!.id, to: creditors[j]!.id, amount: pay / 100 });
      }
      debtors[i]!.v -= pay;
      creditors[j]!.v -= pay;
      if (debtors[i]!.v === 0) i++;
      if (creditors[j]!.v === 0) j++;
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const names = Object.fromEntries(members.map((m) => [m.userId, m.user.name ?? "?"]));

    res.json({
      total,
      balances: [...net.entries()].map(([userId, cents]) => ({
        userId,
        name: names[userId] ?? "?",
        net: cents / 100,
      })),
      transactions: transactions.map((t) => ({
        fromId: t.from,
        toId: t.to,
        from: names[t.from] ?? "?",
        to: names[t.to] ?? "?",
        amount: t.amount,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to compute summary" });
  }
});

// DELETE /api/expenses/:id — only the payer can remove an expense
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (expense.paidBy !== req.userId) return res.status(403).json({ error: "Only the payer can delete it" });

    await prisma.expense.delete({ where: { id } });
    io.to(`plan:${expense.planId}`).emit("expense:removed", { id });
    res.json({ message: "Expense deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;
