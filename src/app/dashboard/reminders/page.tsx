"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Reminder {
  id: string;
  text: string;
  remindAt: string;
  completed: boolean;
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadReminders() {
    const res = await fetch("/api/reminders");
    if (res.ok) {
      const data = await res.json();
      setReminders(data.reminders || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReminders();
  }, []);

  async function addReminder() {
    if (!text.trim() || !when) return;
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, remindAt: new Date(when).toISOString() }),
    });
    if (res.ok) {
      setText("");
      setWhen("");
      await loadReminders();
    }
  }

  async function toggleReminder(reminder: Reminder) {
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reminder.id, completed: !reminder.completed }),
    });
    await loadReminders();
  }

  async function deleteReminder(id: string) {
    await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
    await loadReminders();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Reminders</h1>
        <p className="text-muted-foreground mt-1">Get notified via Telegram when due.</p>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reminder text…" />
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Button onClick={addReminder}><Plus size={16} className="mr-1" /> Add Reminder</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : reminders.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">No reminders scheduled.</div>
      ) : (
        <ul className="space-y-2">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
              <button onClick={() => toggleReminder(reminder)} className={`rounded-lg p-2 ${reminder.completed ? "text-emerald-500" : "text-primary"}`}>
                <Bell size={18} />
              </button>
              <div className="flex-1">
                <p className={reminder.completed ? "line-through text-muted-foreground" : ""}>{reminder.text}</p>
                <p className="text-xs text-muted-foreground">{new Date(reminder.remindAt).toLocaleString()}</p>
              </div>
              <button onClick={() => deleteReminder(reminder.id)} className="text-muted-foreground hover:text-destructive p-2">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
