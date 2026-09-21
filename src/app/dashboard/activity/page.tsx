"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface AppEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<AppEvent[]>([]);

  useEffect(() => {
    fetch("/api/activity")
      .then((res) => res.json())
      .then((data) => setEvents(data.events || []));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity size={28} /> Activity
        </h1>
        <p className="text-muted-foreground mt-1">Every save, task, expense, and search across your LifeFlow OS.</p>
      </div>
      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">No activity yet. Save a link or create a task.</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium capitalize">{event.type.replaceAll("_", " ")}</div>
                <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {String(event.payload.title || event.payload.text || event.payload.name || event.payload.query || "Updated")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
