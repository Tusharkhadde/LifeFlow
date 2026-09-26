"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, CheckSquare, IndianRupee, Inbox, NotebookPen, Users } from "lucide-react";

interface ProjectHub {
  project: { id: string; name: string; description?: string | null; color: string };
  tasks: Array<{ id: string; title: string; completed: boolean; dueAt?: string | null }>;
  knowledge: Array<{ id: string; title: string; summary?: string | null; category: string }>;
  meetings: Array<{ id: string; title: string; summary?: string | null }>;
  expenses: Array<{ id: string; amount: number; category: string; merchant?: string | null }>;
  people: Array<{ id: string; name: string }>;
  inbox: Array<{ id: string; title: string; status: string }>;
  totals: { openTasks: number; spend: number; knowledge: number; inbox: number };
}

export default function ProjectHubPage({ params }: { params: { id: string } }) {
  const [hub, setHub] = useState<ProjectHub | null>(null);

  useEffect(() => {
    fetch(`/api/projects?id=${params.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setHub);
  }, [params.id]);

  if (!hub) return <p className="text-sm text-muted-foreground">Loading project hub…</p>;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft size={14} /> Projects
      </Link>
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: hub.project.color }} />
          <h1 className="text-3xl font-bold">{hub.project.name}</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {hub.project.description || "A unified view of everything connected to this outcome."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Open tasks" value={hub.totals.openTasks} />
          <Metric label="Knowledge" value={hub.totals.knowledge} />
          <Metric label="Spend" value={`₹${Math.round(hub.totals.spend).toLocaleString("en-IN")}`} />
          <Metric label="Inbox" value={hub.totals.inbox} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Tasks" icon={CheckSquare} empty="No tasks linked yet.">
          {hub.tasks.map((task) => (
            <div key={task.id} className={task.completed ? "line-through text-muted-foreground" : ""}>
              {task.title}
              {task.dueAt && <span className="ml-2 text-xs text-muted-foreground">{new Date(task.dueAt).toLocaleDateString()}</span>}
            </div>
          ))}
        </Section>
        <Section title="Meetings" icon={NotebookPen} empty="No meetings linked yet.">
          {hub.meetings.map((meeting) => (
            <div key={meeting.id}>
              <div className="font-medium">{meeting.title}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{meeting.summary}</div>
            </div>
          ))}
        </Section>
        <Section title="Knowledge" icon={Brain} empty="No vault items linked yet.">
          {hub.knowledge
            .filter((item) => item.category !== "Meeting")
            .map((item) => (
              <div key={item.id}>
                <div className="font-medium">{item.title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{item.summary}</div>
              </div>
            ))}
        </Section>
        <Section title="Expenses" icon={IndianRupee} empty="No spending linked yet.">
          {hub.expenses.map((expense) => (
            <div key={expense.id} className="flex justify-between">
              <span>{expense.merchant || expense.category}</span>
              <span>₹{Math.round(expense.amount).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </Section>
        <Section title="People" icon={Users} empty="No people linked yet.">
          {hub.people.map((person) => <div key={person.id}>{person.name}</div>)}
        </Section>
        <Section title="Inbox" icon={Inbox} empty="No pending proposals for this project.">
          {hub.inbox.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.status.toLowerCase()}</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-background/70 p-3">
      <div className="font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  empty,
}: {
  title: string;
  icon: typeof Brain;
  children: React.ReactNode;
  empty: string;
}) {
  const array = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(array) ? array.length === 0 : !array;
  return (
    <section className="glass-card rounded-2xl p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon size={16} className="text-primary" /> {title}
      </h2>
      <div className="space-y-2 text-sm">
        {isEmpty ? <p className="text-muted-foreground">{empty}</p> : array}
      </div>
    </section>
  );
}
