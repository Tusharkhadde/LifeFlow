"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

interface Expense {
  id: string;
  amount: number;
  category: string;
  merchant?: string | null;
  description?: string | null;
  spentAt: string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ total: number; byCategory: Record<string, number>; alerts: string[] }>({ total: 0, byCategory: {}, alerts: [] });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/expenses");
    if (res.ok) {
      const data = await res.json();
      setExpenses(data.expenses || []);
      setSummary(data.summary || { total: 0, byCategory: {}, alerts: [] });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addExpense() {
    if (!input.trim()) return;
    await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input }) });
    setInput("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Expenses</h1>
        <p className="text-muted-foreground mt-1">Track spending via Telegram, bank SMS, or natural language. <a href="/dashboard/budgets" className="text-primary hover:underline">Set budgets →</a></p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-2xl p-5">
          <IndianRupee className="text-emerald-500 mb-2" size={24} />
          <div className="text-2xl font-bold">{formatCurrency(summary.total)}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">This month</div>
        </div>
        {Object.entries(summary.byCategory).slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="glass-card rounded-2xl p-5">
            <TrendingUp className="text-primary mb-2" size={24} />
            <div className="text-2xl font-bold">{formatCurrency(amt)}</div>
            <div className="text-xs text-muted-foreground capitalize">{cat}</div>
          </div>
        ))}
      </div>

      {summary.alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          {summary.alerts.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}

      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder='e.g. "spent ₹500 on lunch"' onKeyDown={(e) => e.key === "Enter" && addExpense()} />
        <Button onClick={addExpense}><Plus size={16} className="mr-1" /> Add</Button>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <li key={e.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
              <span className="font-bold text-emerald-600">{formatCurrency(e.amount)}</span>
              <span className="flex-1 capitalize">{e.merchant || e.description || e.category}</span>
              <span className="text-xs text-muted-foreground capitalize">{e.category}</span>
              <span className="text-xs text-muted-foreground">{new Date(e.spentAt).toLocaleDateString()}</span>
              <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
