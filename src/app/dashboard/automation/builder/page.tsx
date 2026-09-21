"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EVENTS = [
  "knowledge_saved",
  "task_created",
  "task_updated",
  "reminder_created",
  "expense_created",
  "habit_logged",
  "meeting_processed",
  "gmail_synced",
  "inbox_item_created",
];

export default function AutomationBuilderPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [event, setEvent] = useState("inbox_item_created");
  const [action, setAction] = useState("notification");
  const [title, setTitle] = useState("LifeFlow automation");
  const [message, setMessage] = useState("{{payload.title}} needs your attention.");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const actions =
      action === "create_task"
        ? [{ type: "create_task", params: { title: message } }]
        : action === "create_reminder"
          ? [{ type: "create_reminder", params: { text: message, when: "tomorrow" } }]
          : [{ type: "notification", params: { title, message, href: "/dashboard/activity" } }];
    const response = await fetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: `When ${event}, run ${action}`,
        trigger: { type: "event", event },
        conditions: [],
        actions,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not create rule");
      return;
    }
    router.push("/dashboard/automation");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Workflow size={28} /> Automation builder
        </h1>
        <p className="mt-1 text-muted-foreground">Choose a trigger and one safe LifeFlow action.</p>
      </div>

      <div className="glass-card space-y-5 rounded-2xl p-5">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Rule name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Inbox follow-up" />
        </label>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium">When this happens</span>
            <select value={event} onChange={(e) => setEvent(e.target.value)} className="w-full rounded-xl border border-border bg-background p-2.5">
              {EVENTS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <ArrowRight className="hidden text-primary md:block" />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Do this</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full rounded-xl border border-border bg-background p-2.5">
              <option value="notification">Send notification</option>
              <option value="create_task">Create task</option>
              <option value="create_reminder">Create reminder</option>
            </select>
          </label>
        </div>

        {action === "notification" && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Notification title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{action === "notification" ? "Message" : "Task / reminder text"}</span>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          <span className="text-xs text-muted-foreground">Use templates such as {"{{payload.title}}"} or {"{{payload.amount}}"}.</span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={save} disabled={!name.trim() || !message.trim()}>Create automation</Button>
      </div>
    </div>
  );
}
