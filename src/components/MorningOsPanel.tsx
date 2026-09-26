"use client";

import { useEffect, useState } from "react";
import { Loader2, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MorningRun {
  ranAt: string;
  reused: boolean;
  briefing: string;
  watchouts: string[];
  habits: string[];
  calendarConnected: boolean;
  todayEvents: Array<{ summary: string; start: string }>;
  priorities: Array<{
    title: string;
    reason: string;
    minutes: number;
    startAt: string;
    calendarSynced: boolean;
    reused: boolean;
  }>;
}

export function MorningOsPanel() {
  const [run, setRun] = useState<MorningRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/morning")
      .then((res) => res.json())
      .then((data) => setRun(data.run || null))
      .catch(() => {});
  }, []);

  async function runMorning(force = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/morning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, notifyTelegram: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Morning OS failed");
        return;
      }
      setRun(data.run);
    } catch {
      setError("Morning OS failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Sunrise size={18} className="text-amber-500" /> Morning OS
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Briefing, 3 focus blocks, calendar sync, optional Telegram voice.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => runMorning(false)} disabled={busy}>
            {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sunrise size={14} className="mr-1" />}
            Run my morning
          </Button>
          {run && (
            <Button variant="outline" onClick={() => runMorning(true)} disabled={busy}>
              Re-run
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {run && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{run.briefing}</p>
          <div className="space-y-2">
            {run.priorities.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-xl border border-border px-3 py-2 text-sm">
                <div className="font-medium">
                  {index + 1}. {item.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(item.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {item.minutes}m
                    {item.calendarSynced ? " · Calendar" : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{item.reason}</div>
              </div>
            ))}
          </div>
          {run.watchouts.length > 0 && (
            <p className="text-xs text-amber-600">Watchouts: {run.watchouts.join(" · ")}</p>
          )}
          {run.todayEvents.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Already on calendar: {run.todayEvents.map((event) => event.summary).join(", ")}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Last run {new Date(run.ranAt).toLocaleTimeString()} {run.reused ? "(cached for today)" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
