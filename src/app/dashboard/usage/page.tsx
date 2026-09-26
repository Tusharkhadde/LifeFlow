"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Search, Sparkles } from "lucide-react";

interface UsageMetric {
  action: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
}

interface AiUsage {
  month: { costUsd: number; calls: number; inputTokens: number; outputTokens: number };
  budgetUsd: number | null;
  preferredFastModel: string | null;
  cacheHits: number;
  byOperation: Array<{ operation: string; calls: number; costUsd: number }>;
}

export default function UsagePage() {
  const [metrics, setMetrics] = useState<UsageMetric[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        setMetrics(d.metrics || []);
        setTotals(d.totals || {});
        setAi(d.ai || null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Usage Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track your AI and feature usage (30-day window).</p>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {metrics.map((m) => (
              <div key={m.action} className="glass-card rounded-2xl p-5">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-sm text-muted-foreground">{m.used}/{m.limit}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${m.percent >= 90 ? "bg-red-500" : m.percent >= 70 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${m.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Stat icon={Database} label="Vault items" value={totals.vaultItems} />
            <Stat icon={Activity} label="Expenses" value={totals.expensesThisMonth} />
            <Stat icon={Sparkles} label="Habits" value={totals.activeHabits} />
            <Stat icon={Search} label="Searches" value={totals.searchesThisMonth} />
          </div>

          {ai && (
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold">AI cost this month</h2>
              <p className="text-sm text-muted-foreground">
                ${ai.month.costUsd.toFixed(4)} across {ai.month.calls} calls
                {ai.budgetUsd ? ` · budget $${ai.budgetUsd.toFixed(2)}` : ""}
                {` · ${ai.cacheHits} cache hits`}
                {ai.preferredFastModel ? ` · fast model ${ai.preferredFastModel}` : ""}
              </p>
              <div className="space-y-2">
                {ai.byOperation.map((row) => (
                  <div key={row.operation} className="flex justify-between text-sm">
                    <span>{row.operation}</span>
                    <span className="text-muted-foreground">{row.calls} · ${row.costUsd.toFixed(4)}</span>
                  </div>
                ))}
                {!ai.byOperation.length && <p className="text-sm text-muted-foreground">No AI calls recorded yet.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value?: number }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center">
      <Icon size={20} className="mx-auto mb-2 text-primary" />
      <div className="text-2xl font-bold">{value ?? 0}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
