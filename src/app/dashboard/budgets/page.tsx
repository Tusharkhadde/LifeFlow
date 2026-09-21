"use client";

import { useEffect, useState, useCallback } from "react";
import { Target, PiggyBank, Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

export default function BudgetsPage() {
  const [data, setData] = useState<{
    budgets: Array<{ id: string; category: string; limitAmount: number; spent: number; percent: number; overBudget: boolean }>;
    goals: Array<{ id: string; name: string; targetAmount: number; currentAmount: number; percent: number }>;
    totalSpent: number;
    globalLimit: number | null;
    globalPercent: number | null;
  } | null>(null);
  const [bills, setBills] = useState<Array<{ id: string; name: string; amount: number; nextDueAt?: string }>>([]);
  const [catBudget, setCatBudget] = useState({ category: "food", limit: "" });
  const [goalForm, setGoalForm] = useState({ name: "", target: "" });
  const [globalLimit, setGlobalLimit] = useState("");

  const load = useCallback(async () => {
    const [budgetRes, billsRes] = await Promise.all([fetch("/api/budgets"), fetch("/api/bills")]);
    if (budgetRes.ok) setData(await budgetRes.json());
    if (billsRes.ok) setBills((await billsRes.json()).bills || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addBudget() {
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: catBudget.category, limitAmount: Number(catBudget.limit) }),
    });
    await load();
  }

  async function setGlobal() {
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ globalLimit: Number(globalLimit) }),
    });
    await load();
  }

  async function addGoal() {
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: goalForm.name, targetAmount: Number(goalForm.target) }),
    });
    setGoalForm({ name: "", target: "" });
    await load();
  }

  async function detectBills() {
    await fetch("/api/bills", { method: "POST" });
    await load();
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Budgets & Goals</h1>
        <p className="text-muted-foreground mt-1">Smart finance planning — ready for premium tier.</p>
      </div>

      {data && (
        <div className="glass-card rounded-2xl p-5">
          <div className="text-2xl font-bold">{formatCurrency(data.totalSpent)} spent this month</div>
          {data.globalLimit && (
            <div className="mt-2 text-sm text-muted-foreground">
              Global budget: {formatCurrency(data.globalLimit)} ({data.globalPercent}% used)
            </div>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Target size={18} /> Category budgets</h2>
        <div className="flex gap-2 flex-wrap">
          <Input className="w-32" value={catBudget.category} onChange={(e) => setCatBudget({ ...catBudget, category: e.target.value })} placeholder="Category" />
          <Input className="w-32" value={catBudget.limit} onChange={(e) => setCatBudget({ ...catBudget, limit: e.target.value })} placeholder="Limit ₹" type="number" />
          <Button onClick={addBudget}><Plus size={14} className="mr-1" /> Add</Button>
        </div>
        <div className="flex gap-2">
          <Input value={globalLimit} onChange={(e) => setGlobalLimit(e.target.value)} placeholder="Global monthly limit ₹" type="number" />
          <Button variant="outline" onClick={setGlobal}>Set global</Button>
        </div>
        <div className="space-y-2">
          {data?.budgets.map((b) => (
            <div key={b.id} className="glass-card rounded-xl p-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize font-medium">{b.category}</span>
                <span className={b.overBudget ? "text-red-500" : ""}>{formatCurrency(b.spent)} / {formatCurrency(b.limitAmount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${b.overBudget ? "bg-red-500" : "bg-primary"}`} style={{ width: `${b.percent}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><PiggyBank size={18} /> Savings goals</h2>
        <div className="flex gap-2">
          <Input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Goal name" />
          <Input value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} placeholder="Target ₹" type="number" />
          <Button onClick={addGoal}><Plus size={14} className="mr-1" /> Add goal</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {data?.goals.map((g) => (
            <div key={g.id} className="glass-card rounded-xl p-4">
              <div className="font-medium">{g.name}</div>
              <div className="text-sm text-muted-foreground">{formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}</div>
              <div className="h-1.5 rounded-full bg-muted mt-2"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${g.percent}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Receipt size={18} /> Bill autopilot</h2>
          <Button variant="outline" size="sm" onClick={detectBills}>Detect bills</Button>
        </div>
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log recurring expenses — autopilot will detect patterns.</p>
        ) : (
          <ul className="space-y-2">
            {bills.map((b) => (
              <li key={b.id} className="glass-card rounded-xl p-3 flex justify-between text-sm">
                <span>{b.name}</span>
                <span>{formatCurrency(b.amount)}{b.nextDueAt ? ` · due ${new Date(b.nextDueAt).toLocaleDateString()}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <a href="/api/report/monthly?format=markdown" className="inline-flex text-sm text-primary hover:underline">
        Download monthly report (Markdown)
      </a>
    </div>
  );
}
