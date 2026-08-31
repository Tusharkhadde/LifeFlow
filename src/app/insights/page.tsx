"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, CheckCircle2, Gauge, Sparkles } from "lucide-react";

interface InsightStat {
  activeTasks: number;
  overdueTasks: number;
  upcomingReminders: number;
  savedKnowledge: number;
  dueSoonTasks: number;
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string>("");
  const [productivityScore, setProductivityScore] = useState(0);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [nextActions, setNextActions] = useState<string[]>([]);
  const [stats, setStats] = useState<InsightStat>({
    activeTasks: 0,
    overdueTasks: 0,
    upcomingReminders: 0,
    savedKnowledge: 0,
    dueSoonTasks: 0,
  });

  useEffect(() => {
    async function loadInsights() {
      try {
        const res = await fetch("/api/insights");
        if (!res.ok) throw new Error("Failed to fetch insights");
        const data = await res.json();
        setSummary(data.summary || "Your system is steady and ready for focus.");
        setProductivityScore(data.productivityScore || 0);
        setPriorities(data.priorities || []);
        setAlerts(data.alerts || []);
        setNextActions(data.nextActions || []);
        setStats(data.stats || {
          activeTasks: 0,
          overdueTasks: 0,
          upcomingReminders: 0,
          savedKnowledge: 0,
          dueSoonTasks: 0,
        });
      } catch (error) {
        console.error("Insights fetch failed", error);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, []);

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-indigo-500/10 p-6 md:p-8">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            <BrainCircuit size={18} />
            LifeFlow AI brief
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">Daily insight overview</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">{summary}</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading intelligence…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Productivity score" value={`${productivityScore}/100`} icon={<Gauge size={18} />} accent="text-emerald-400" />
              <StatCard label="Active tasks" value={String(stats.activeTasks)} icon={<Activity size={18} />} accent="text-sky-400" />
              <StatCard label="Due soon" value={String(stats.dueSoonTasks)} icon={<ArrowRight size={18} />} accent="text-violet-400" />
              <StatCard label="Reminders" value={String(stats.upcomingReminders)} icon={<Sparkles size={18} />} accent="text-amber-400" />
              <StatCard label="Knowledge" value={String(stats.savedKnowledge)} icon={<CheckCircle2 size={18} />} accent="text-pink-400" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="Priority focus" icon={<Activity size={16} />}>
                <ul className="space-y-3">
                  {priorities.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="AI alerts" icon={<Sparkles size={16} />}>
                <ul className="space-y-3">
                  {alerts.map((alert) => (
                    <li key={alert} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span>{alert}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Suggested next actions" icon={<ArrowRight size={16} />}>
                <ul className="space-y-3">
                  {nextActions.map((action) => (
                    <li key={action} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`mb-4 inline-flex rounded-xl bg-muted p-2 ${accent}`}>{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
