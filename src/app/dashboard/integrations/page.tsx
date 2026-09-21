"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, BookOpen, Mail, RefreshCw, Unplug, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { waitForJob } from "@/lib/job-client";

type Provider = "google_calendar" | "notion" | "gmail";

interface IntegrationStatus {
  provider: Provider;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  syncEnabled: boolean;
  lastSyncAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

const PROVIDER_PATHS: Record<Provider, string> = {
  google_calendar: "/api/integrations/google-calendar",
  notion: "/api/integrations/notion",
  gmail: "/api/integrations/gmail",
};

const PROVIDER_NAMES: Record<Provider, string> = {
  google_calendar: "Google Calendar",
  notion: "Notion",
  gmail: "Gmail",
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading integrations…</p>}>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/integrations");
    if (res.ok) {
      const data = await res.json();
      setIntegrations(data.integrations || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const connected = searchParams.get("connected") as Provider | null;
    const imported = searchParams.get("imported");
    const error = searchParams.get("error");

    if (connected === "google_calendar") {
      setMessage("Google Calendar connected. Your tasks and reminders will sync automatically.");
    } else if (connected === "notion") {
      setMessage(imported ? `Notion connected. Imported ${imported} page(s) into your knowledge vault.` : "Notion connected. Use Import to pull pages into your vault.");
    } else if (connected === "gmail") {
      setMessage(imported ? `Gmail connected. ${imported} email(s) became bills, tasks, or vault items.` : "Gmail connected. Use Scan inbox to process recent mail.");
    } else if (error) {
      setMessage(`Connection failed: ${decodeURIComponent(error)}`);
    }
  }, [searchParams]);

  async function connect(provider: Provider) {
    setBusy(provider);
    try {
      const res = await fetch(`${PROVIDER_PATHS[provider]}/auth`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.error || "OAuth not configured. Check your .env file.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: Provider) {
    setBusy(`disconnect-${provider}`);
    try {
      await fetch(PROVIDER_PATHS[provider], { method: "DELETE" });
      setMessage(`${PROVIDER_NAMES[provider]} disconnected.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function sync(provider: Provider, body: Record<string, unknown>, describe: (data: Record<string, number>) => string) {
    setBusy(`sync-${provider}`);
    try {
      const res = await fetch(PROVIDER_PATHS[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data = await res.json();
      if (res.ok && data.job?.id) {
        const job = await waitForJob(data.job.id);
        if (job.status !== "COMPLETED") throw new Error(job.lastError || "Sync failed");
        data = (job.result || {}) as Record<string, number>;
      }
      setMessage(res.ok ? describe(data) : data.error || "Sync failed");
      if (res.ok) await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  function getIcon(icon: string) {
    if (icon === "calendar") return Calendar;
    if (icon === "mail") return Mail;
    return BookOpen;
  }

  function formatLastSync(at?: string | null) {
    if (!at) return "Never";
    return new Date(at).toLocaleString();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect Google Calendar, Gmail, and Notion so LifeFlow stays in sync with the tools you already use.
        </p>
      </div>

      {message && (
        <div className="glass-card rounded-xl p-4 flex items-start gap-3 text-sm">
          {/failed/i.test(message) ? (
            <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={18} />
          ) : (
            <CheckCircle2 className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
          )}
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading integrations…</p>
      ) : (
        <div className="space-y-4">
          {integrations.map((item) => {
            const Icon = getIcon(item.icon);
            const syncing = busy === `sync-${item.provider}`;

            return (
              <div key={item.provider} className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {item.name}
                      {item.connected && (
                        <span className="text-xs font-normal text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">Connected</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    {item.connected && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last sync: {formatLastSync(item.lastSyncAt)}
                        {item.metadata?.workspaceName ? ` · ${String(item.metadata.workspaceName)}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!item.connected ? (
                    <Button onClick={() => connect(item.provider)} disabled={busy === item.provider}>
                      Connect {item.name}
                    </Button>
                  ) : (
                    <>
                      {item.provider === "google_calendar" && (
                        <>
                          <Button variant="outline" disabled={syncing} onClick={() => sync("google_calendar", { action: "push" }, (d) => `Synced ${d.synced ?? 0} tasks and reminders to Google Calendar.`)}>
                            <RefreshCw size={14} className="mr-1" /> Push to Calendar
                          </Button>
                          <Button variant="outline" disabled={syncing} onClick={() => sync("google_calendar", { action: "pull" }, (d) => `Imported ${d.imported ?? 0} upcoming calendar events as tasks.`)}>
                            Pull from Calendar
                          </Button>
                        </>
                      )}
                      {item.provider === "notion" && (
                        <Button variant="outline" disabled={syncing} onClick={() => sync("notion", { limit: 25 }, (d) => `Imported ${d.imported ?? 0} Notion pages (${d.skipped ?? 0} already in vault).`)}>
                          <RefreshCw size={14} className="mr-1" /> Import pages
                        </Button>
                      )}
                      {item.provider === "gmail" && (
                        <Button variant="outline" disabled={syncing} onClick={() => sync("gmail", { limit: 25 }, (d) => `Scanned ${d.scanned ?? 0} emails → ${d.bills ?? 0} bills, ${d.actions ?? 0} tasks, ${d.knowledge ?? 0} vault items.`)}>
                          <RefreshCw size={14} className="mr-1" /> Scan inbox
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => disconnect(item.provider)}
                        disabled={busy === `disconnect-${item.provider}`}
                      >
                        <Unplug size={14} className="mr-1" /> Disconnect
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-sm text-muted-foreground glass-card rounded-xl p-4 space-y-2">
        <p className="font-medium text-foreground">Setup notes</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Google Calendar and Gmail use separate OAuth flows from sign-in — connect them here even if you log in with Google.</li>
          <li>Tasks with due dates and all reminders sync to your primary Google Calendar.</li>
          <li>Gmail is read-only: bills become reminders, action emails become tasks, newsletters go to the vault.</li>
          <li>Notion imports recent pages into your knowledge vault for AI search and memory.</li>
          <li>Add redirect URIs in Google Cloud Console and Notion integration settings (see .env.example).</li>
        </ul>
      </div>
    </div>
  );
}
