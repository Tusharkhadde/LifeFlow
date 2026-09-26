"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Brain,
  CheckSquare,
  Flame,
  IndianRupee,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MorningOsPanel } from "@/components/MorningOsPanel";

interface Overview {
  insights: {
    summary: string;
    productivityScore: number;
    priorities: string[];
    nextActions: string[];
    stats: { activeTasks: number; overdueTasks: number; upcomingReminders: number; savedKnowledge: number };
  };
  alerts: Array<{ title: string; message: string; severity: string }>;
  expenses: { total: number; alerts: string[] };
  habits: Array<{ name: string; streak: number; loggedToday: boolean }>;
  tasks: {
    overdue: Array<{ id: string; title: string; dueAt?: string | null }>;
    upcoming: Array<{ id: string; title: string; dueAt?: string | null }>;
  };
  reminders: Array<{ id: string; text: string; remindAt: string }>;
  recentKnowledge: Array<{ id: string; title: string; aiMemory?: string | null; type: string }>;
  onboarding: { items: Array<{ key: string; label: string; done: boolean; href: string }>; completed: number; total: number };
  inbox: { pending: number; snoozed: number; acceptedToday: number };
}

export default function TodayPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/overview")
      .then((res) => res.json())
      .then((payload) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Building your command center…</p>;
  }

  if (!data?.insights) {
    return <p className="text-sm text-muted-foreground">Could not load today&apos;s overview.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/15 via-background to-indigo-500/10 p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Command Center</div>
        <h1 className="mt-3 text-3xl font-bold">Today in LifeFlow</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{data.insights.summary}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Score label="Focus score" value={`${data.insights.productivityScore}/100`} />
          <Score label="Tasks" value={String(data.insights.stats.activeTasks)} />
          <Score label="Vault" value={String(data.insights.stats.savedKnowledge)} />
          <Score label="Spend" value={`₹${Math.round(data.expenses.total).toLocaleString("en-IN")}`} />
        </div>
      </div>

      <MorningOsPanel />

      {data.inbox.pending > 0 && (
        <Link
          href="/dashboard/inbox"
          className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4 transition hover:bg-primary/10"
        >
          <div>
            <div className="font-semibold">{data.inbox.pending} item{data.inbox.pending === 1 ? "" : "s"} ready to triage</div>
            <div className="text-sm text-muted-foreground">Approve tasks, reminders, bills, and knowledge before LifeFlow acts.</div>
          </div>
          <ArrowRight size={18} className="text-primary" />
        </Link>
      )}

      {data.onboarding.completed < data.onboarding.total && (
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Get the full OS running</h2>
            <span className="text-xs text-muted-foreground">
              {data.onboarding.completed}/{data.onboarding.total} complete
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {data.onboarding.items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-xl border px-3 py-2 text-sm ${item.done ? "border-emerald-500/30 text-muted-foreground" : "border-border hover:border-primary/40"}`}
              >
                {item.done ? "✓" : "○"} {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} className="text-amber-500" /> Proactive alerts
          </div>
          {data.alerts.slice(0, 3).map((alert) => (
            <p key={alert.title} className="text-muted-foreground">
              <span className="text-foreground">{alert.title}:</span> {alert.message}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tasks" href="/dashboard/tasks" icon={CheckSquare}>
          {data.tasks.upcoming.length === 0 ? (
            <Empty text="No open tasks. Add one from the vault or Telegram." />
          ) : (
            data.tasks.upcoming.slice(0, 5).map((task) => (
              <div key={task.id} className="text-sm">
                {task.title}
                {task.dueAt && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(task.dueAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))
          )}
        </Panel>
        <Panel title="Reminders" href="/dashboard/reminders" icon={Bell}>
          {data.reminders.length === 0 ? (
            <Empty text="Nothing due in the next day." />
          ) : (
            data.reminders.map((reminder) => (
              <div key={reminder.id} className="text-sm">
                {reminder.text}
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(reminder.remindAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </Panel>
        <Panel title="Recent knowledge" href="/dashboard" icon={Brain}>
          {data.recentKnowledge.length === 0 ? (
            <Empty text="Paste a URL into the vault to start your second brain." />
          ) : (
            data.recentKnowledge.map((item) => (
              <div key={item.id} className="text-sm">
                <div className="font-medium">{item.title}</div>
                {item.aiMemory && <div className="text-xs text-muted-foreground">{item.aiMemory}</div>}
              </div>
            ))
          )}
        </Panel>
        <Panel title="Habits" href="/dashboard/habits" icon={Flame}>
          {data.habits.length === 0 ? (
            <Empty text="Track a habit like meditation or gym." />
          ) : (
            data.habits.map((habit) => (
              <div key={habit.name} className="flex justify-between text-sm">
                <span>{habit.name}</span>
                <span className="text-muted-foreground">{habit.streak}d {habit.loggedToday ? "✅" : ""}</span>
              </div>
            ))
          )}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <QuickLink href="/assistant" icon={Sparkles} label="Ask the brain" />
        <QuickLink href="/dashboard/expenses" icon={IndianRupee} label="Log spending" />
        <QuickLink href="/dashboard/developer" icon={ArrowRight} label="API & share links" />
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background/70 px-4 py-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, href, icon: Icon, children }: { title: string; href: string; icon: typeof Brain; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon size={16} className="text-primary" /> {title}
        </h2>
        <Link href={href} className="text-xs text-primary">Open</Link>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Brain; label: string }) {
  return (
    <Button asChild variant="outline" className="justify-start h-12">
      <Link href={href}>
        <Icon size={16} className="mr-2" /> {label}
      </Link>
    </Button>
  );
}
