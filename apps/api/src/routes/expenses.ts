import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { io } from "../server";

const router = Router();

async function assertPlanMember(userId: string, planId: string) {
  const m = await prisma.planMember.findUnique({
    where: { userId_planId: { userId, planId } },
  });
  return m && m.status === "member" ? m : null;
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
// ?mode=equal → ignore per-expense splits and divide the grand total between ALL members
router.get("/plan/:planId/summary", authMiddleware, async (req: Request, res: Response) => {
  const planId = String(req.params["planId"]);
  const mode = req.query["mode"] === "equal" ? "equal" : "expense";
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

    if (mode === "equal") {
      // Everything split evenly between every plan member, regardless of
      // per-expense splits. Settled marks are ignored in this view.
      const totalCents = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0);
      const n = members.length || 1;
      const base = Math.floor(totalCents / n);
      const remainder = totalCents - base * n;
      members.forEach((m, i) => {
        const share = base + (i < remainder ? 1 : 0);
        net.set(m.userId, (net.get(m.userId) ?? 0) - share);
      });
      for (const exp of expenses) {
        const cents = Math.round(exp.amount * 100);
        net.set(exp.paidBy, (net.get(exp.paidBy) ?? 0) + cents);
      }
    } else {
      // Per-expense mode: only unsettled shares count as open debt
      for (const exp of expenses) {
        for (const split of exp.splits) {
          if (split.settled) continue;
          const cents = Math.round(split.amount * 100);
          net.set(exp.paidBy, (net.get(exp.paidBy) ?? 0) + cents);
          net.set(split.userId, (net.get(split.userId) ?? 0) - cents);
        }
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
      mode,
      total,
      perPerson: mode === "equal" && members.length > 0 ? total / members.length : null,
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

// PATCH /api/expenses/:expenseId/splits/:userId — mark a share as paid/unpaid.
// Allowed: the person who owes it, the expense payer, or the plan admin.
router.patch("/:expenseId/splits/:userId", authMiddleware, async (req: Request, res: Response) => {
  const expenseId = String(req.params["expenseId"]);
  const targetUserId = String(req.params["userId"]);
  const { settled } = req.body as { settled: boolean };

  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { splits: true },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const membership = await assertPlanMember(req.userId!, expense.planId);
    if (!membership) return res.status(403).json({ error: "Not a member of this plan" });

    const isOwner = targetUserId === req.userId;
    const isPayer = expense.paidBy === req.userId;
    const isAdmin = membership.role === "admin";
    if (!isOwner && !isPayer && !isAdmin) {
      return res.status(403).json({ error: "You can only mark your own share as paid" });
    }

    const split = expense.splits.find((s) => s.userId === targetUserId);
    if (!split) return res.status(404).json({ error: "That user has no share in this expense" });

    const updated = await prisma.expenseSplit.update({
      where: { id: split.id },
      data: { settled: !!settled },
    });

    io.to(`plan:${expense.planId}`).emit("expense:added", { refresh: true });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update share" });
  }
});

// DELETE /api/expenses/:id — the payer or the plan admin can remove an expense
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const membership = await assertPlanMember(req.userId!, expense.planId);
    const isPayer = expense.paidBy === req.userId;
    const isAdmin = membership?.role === "admin";
    if (!isPayer && !isAdmin) {
      return res.status(403).json({ error: "Only the payer or the plan admin can delete it" });
    }

    await prisma.expense.delete({ where: { id } });
    io.to(`plan:${expense.planId}`).emit("expense:removed", { id });
    res.json({ message: "Expense deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;
