"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveX, Check, Inbox, Loader2, Moon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectPicker } from "@/components/ProjectPicker";

interface InboxRecord {
  id: string;
  source: string;
  kind: string;
  title: string;
  summary?: string | null;
  payload: Record<string, unknown>;
  priority: number;
  createdAt: string;
  projectId?: string | null;
  project?: { id: string; name: string; color: string } | null;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxRecord[]>([]);
  const [summary, setSummary] = useState({ pending: 0, snoozed: 0, acceptedToday: 0 });
  const [selected, setSelected] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState("PENDING");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inbox?status=${filter}`);
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.items || []);
    setSummary(data.summary || { pending: 0, snoozed: 0, acceptedToday: 0 });
    setSelected([]);
    setActiveIndex(0);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(async (id: string, action: "accept" | "dismiss" | "snooze", projectId?: string | null) => {
    setBusy(id);
    try {
      await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          projectId,
          ...(action === "snooze" ? { until: new Date(Date.now() + 86400000).toISOString() } : {}),
        }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (event.key === "j") setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      if (event.key === "k") setActiveIndex((index) => Math.max(0, index - 1));
      const item = items[activeIndex];
      if (!item) return;
      if (event.key === "a") void act(item.id, "accept", item.projectId);
      if (event.key === "d") void act(item.id, "dismiss");
      if (event.key === "s") void act(item.id, "snooze");
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [items, activeIndex, act]);

  async function bulk(action: "accept" | "dismiss") {
    if (!selected.length) return;
    setBusy("bulk");
    try {
      await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", bulkAction: action, ids: selected }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl" data-tour="inbox">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Inbox size={28} /> Universal Inbox
          </h1>
          <p className="mt-1 text-muted-foreground">
            Review what Gmail, Telegram, meetings, documents, and LifeFlow want to create.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw size={14} className="mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Pending" value={summary.pending} />
        <Metric label="Snoozed" value={summary.snoozed} />
        <Metric label="Accepted today" value={summary.acceptedToday} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["PENDING", "SNOOZED", "ACCEPTED", "DISMISSED"].map((status) => (
          <Button
            key={status}
            size="sm"
            variant={filter === status ? "default" : "outline"}
            onClick={() => setFilter(status)}
          >
            {status.toLowerCase()}
          </Button>
        ))}
        {selected.length > 0 && filter === "PENDING" && (
          <>
            <span className="ml-auto text-xs text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" onClick={() => bulk("accept")} disabled={busy === "bulk"}>
              Accept selected
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("dismiss")} disabled={busy === "bulk"}>
              Dismiss selected
            </Button>
          </>
        )}
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Inbox zero. New proposals from connected sources will appear here.
          </div>
        ) : (
          items.map((item, index) => (
            <article
              key={item.id}
              className={`glass-card rounded-2xl border p-4 transition ${
                index === activeIndex ? "border-primary/60" : "border-border"
              }`}
              onClick={() => setActiveIndex(index)}
            >
              <div className="flex gap-3">
                {filter === "PENDING" && (
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id)
                      )
                    }
                    aria-label={`Select ${item.title}`}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {item.kind}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{item.source}</span>
                    {item.priority >= 70 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">
                        high priority
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold">{item.title}</h2>
                  {item.summary && <p className="text-sm text-muted-foreground">{item.summary}</p>}
                  {filter === "PENDING" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectPicker
                        value={item.projectId}
                        onChange={(projectId) =>
                          setItems((current) =>
                            current.map((candidate) =>
                              candidate.id === item.id ? { ...candidate, projectId } : candidate
                            )
                          )
                        }
                      />
                      <Button size="sm" onClick={() => act(item.id, "accept", item.projectId)} disabled={busy === item.id}>
                        {busy === item.id ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Check size={13} className="mr-1" />}
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(item.id, "snooze")}>
                        <Moon size={13} className="mr-1" /> Tomorrow
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(item.id, "dismiss")}>
                        <ArchiveX size={13} className="mr-1" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Keyboard: J/K move · A accept · D dismiss · S snooze
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
