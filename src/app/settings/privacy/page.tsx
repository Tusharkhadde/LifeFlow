"use client";

import { useEffect, useState } from "react";
import { Download, Shield, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PrivacyState {
  deletion?: { status: string; executeAt: string } | null;
  retentionDays: number;
  connected: { integrations: number; apiKeys: number; shareLinks: number; webhooks: number };
}

export default function PrivacyPage() {
  const [state, setState] = useState<PrivacyState | null>(null);
  const [retentionDays, setRetentionDays] = useState("365");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/privacy");
    if (!response.ok) return;
    const data = await response.json();
    setState(data);
    setRetentionDays(String(data.retentionDays || 365));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRetention() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays: Number(retentionDays) }),
    });
    setMessage("Retention preference saved.");
    await load();
  }

  async function deletion(action: "request-deletion" | "cancel-deletion") {
    const response = await fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    setMessage(response.ok ? (action === "request-deletion" ? "Deletion scheduled. You can cancel during the 7-day grace period." : "Deletion cancelled.") : data.error);
    setConfirm("");
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Shield size={28} /> Privacy Center
        </h1>
        <p className="mt-1 text-muted-foreground">
          Export your complete data, control retention, review connections, or delete your account.
        </p>
      </div>

      {message && <div className="glass-card rounded-xl p-3 text-sm">{message}</div>}

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Export everything</h2>
        <p className="text-sm text-muted-foreground">
          Includes vault content, memories, graph, tasks, reminders, expenses, projects, inbox, automations, activity, and audit logs. Secrets and token hashes are excluded.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/export?format=json"><Download size={14} className="mr-1" /> JSON</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?format=markdown"><Download size={14} className="mr-1" /> Markdown</a>
          </Button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Data retention</h2>
        <p className="text-sm text-muted-foreground">
          Read notifications, usage logs, searches, and activity older than this are removed by daily maintenance. Vault content is retained until you delete it.
        </p>
        <div className="flex max-w-sm gap-2">
          <Input type="number" min={30} max={3650} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} />
          <Button onClick={saveRetention}>Save days</Button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold">Connected access</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Connection label="Integrations" value={state?.connected.integrations || 0} />
          <Connection label="API keys" value={state?.connected.apiKeys || 0} />
          <Connection label="Share links" value={state?.connected.shareLinks || 0} />
          <Connection label="Webhooks" value={state?.connected.webhooks || 0} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Revoke these from Integrations, Developer, and Automation before sharing an export.
        </p>
      </section>

      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h2 className="font-semibold text-destructive">Delete account and data</h2>
        {state?.deletion?.status === "pending" ? (
          <>
            <p className="text-sm">
              Deletion is scheduled for {new Date(state.deletion.executeAt).toLocaleString()}. OAuth tokens, API keys, shares, webhooks, and all user data will be removed.
            </p>
            <Button variant="outline" onClick={() => deletion("cancel-deletion")}>
              <Undo2 size={14} className="mr-1" /> Cancel deletion
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              A 7-day grace period starts after confirmation. Type <strong>DELETE</strong> to continue.
            </p>
            <div className="flex max-w-sm gap-2">
              <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE" />
              <Button variant="destructive" disabled={confirm !== "DELETE"} onClick={() => deletion("request-deletion")}>
                <Trash2 size={14} className="mr-1" /> Schedule
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Connection({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
