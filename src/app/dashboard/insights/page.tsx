"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, CheckCircle2, Gauge, Sparkles, AlertTriangle } from "lucide-react";

interface InsightStat {
  activeTasks: number;
  overdueTasks: number;
  upcomingReminders: number;
  savedKnowledge: number;
  dueSoonTasks: number;
}

interface ProactiveAlert {
  type: string;
  severity: string;
  title: string;
  message: string;
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [productivityScore, setProductivityScore] = useState(0);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [proactiveAlerts, setProactiveAlerts] = useState<ProactiveAlert[]>([]);
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
        setSummary(data.summary || "");
        setProductivityScore(data.productivityScore || 0);
        setPriorities(data.priorities || []);
        setAlerts(data.alerts || []);
        setProactiveAlerts(data.proactiveAlerts || []);
        setNextActions(data.nextActions || []);
        setStats(data.stats || stats);
      } catch (error) {
        console.error("Insights fetch failed", error);
      } finally {
        setLoading(false);
      }
    }
    loadInsights();
  }, []);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-indigo-500/10 p-6 md:p-8">
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          <BrainCircuit size={18} />
          Proactive Intelligence
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Daily insight overview</h1>
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

          {proactiveAlerts.length > 0 && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
              <h2 className="flex items-center gap-2 font-semibold mb-4"><AlertTriangle size={18} className="text-amber-500" /> Proactive alerts</h2>
              <ul className="space-y-2">
                {proactiveAlerts.map((alert) => (
                  <li key={alert.title + alert.message} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{alert.title}:</span> {alert.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`mb-4 inline-flex rounded-xl bg-muted p-2 ${accent}`}>{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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
