"use client";

import { useEffect, useState } from "react";
import { Flame, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Habit {
  id: string;
  name: string;
  streak: number;
  loggedToday: boolean;
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/habits");
    if (res.ok) {
      const data = await res.json();
      setHabits(data.habits || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addHabit() {
    if (!name.trim()) return;
    await fetch("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName("");
    await load();
  }

  async function logHabit(habitName: string) {
    await fetch("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "log", habitName }) });
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Habits</h1>
        <p className="text-muted-foreground mt-1">Build streaks. Log via Telegram: &quot;done meditation&quot;</p>
      </div>

      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit…" onKeyDown={(e) => e.key === "Enter" && addHabit()} />
        <Button onClick={addHabit}><Plus size={16} className="mr-1" /> Track</Button>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : habits.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">No habits yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {habits.map((h) => (
            <div key={h.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{h.name}</h3>
                <div className="flex items-center gap-1 text-orange-500">
                  <Flame size={18} />
                  <span className="font-bold">{h.streak}</span>
                </div>
              </div>
              <Button
                variant={h.loggedToday ? "outline" : "default"}
                size="sm"
                disabled={h.loggedToday}
                onClick={() => logHabit(h.name)}
              >
                <Check size={14} className="mr-1" />
                {h.loggedToday ? "Done today" : "Log today"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
