"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, Plus, Power, Trash2, Webhook, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Run {
  id: string;
  status: string;
  error?: string | null;
  startedAt: string;
}

interface Rule {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger: { type?: string; event?: string; cadence?: string };
  actions: unknown[];
  runCount: number;
  runs: Run[];
}

interface Template {
  id: string;
  name: string;
  description: string;
}

interface Hook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  _count?: { deliveries: number };
  secret?: string;
}

export default function AutomationPage() {
  const [tab, setTab] = useState<"rules" | "webhooks">("rules");
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [webhooks, setWebhooks] = useState<Hook[]>([]);
  const [url, setUrl] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [rulesResponse, hooksResponse] = await Promise.all([
      fetch("/api/automation/rules"),
      fetch("/api/webhooks"),
    ]);
    if (rulesResponse.ok) {
      const data = await rulesResponse.json();
      setRules(data.rules || []);
      setTemplates(data.templates || []);
    }
    if (hooksResponse.ok) setWebhooks((await hooksResponse.json()).webhooks || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addTemplate(templateId: string) {
    const response = await fetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Created “${data.rule.name}”` : data.error);
    await load();
  }

  async function toggle(rule: Rule) {
    await fetch("/api/automation/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    await load();
  }

  async function test(rule: Rule) {
    const response = await fetch("/api/automation/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: rule.id,
        action: "test",
        input: { event: rule.trigger.event || "manual", payload: { amount: 7500, title: "Test item", category: "test" } },
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Test run completed." : data.error || "Test failed.");
    await load();
  }

  async function removeRule(id: string) {
    await fetch(`/api/automation/rules?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function addWebhook() {
    if (!url.trim()) return;
    const response = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (response.ok) {
      setNewSecret(data.webhook.secret);
      setUrl("");
    } else {
      setMessage(data.error || "Could not create webhook");
    }
    await load();
  }

  async function removeWebhook(id: string) {
    await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Workflow size={28} /> Automation
        </h1>
        <p className="mt-1 text-muted-foreground">
          Safe event and schedule rules built on LifeFlow&apos;s typed tool registry.
        </p>
      </div>

      {message && <div className="glass-card rounded-xl p-3 text-sm">{message}</div>}

      <div className="flex gap-2">
        <Button variant={tab === "rules" ? "default" : "outline"} onClick={() => setTab("rules")}>
          <Workflow size={14} className="mr-1" /> Rules
        </Button>
        <Button variant={tab === "webhooks" ? "default" : "outline"} onClick={() => setTab("webhooks")}>
          <Webhook size={14} className="mr-1" /> Webhooks
        </Button>
        <Button asChild variant="outline" className="ml-auto">
          <Link href="/dashboard/automation/builder"><Plus size={14} className="mr-1" /> Custom rule</Link>
        </Button>
      </div>

      {tab === "rules" ? (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Templates</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {templates.map((template) => (
                <div key={template.id} className="glass-card rounded-xl p-4">
                  <div className="font-medium">{template.name}</div>
                  <p className="mt-1 min-h-12 text-xs text-muted-foreground">{template.description}</p>
                  <Button size="sm" className="mt-3" onClick={() => addTemplate(template.id)}>
                    <Plus size={13} className="mr-1" /> Use template
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Your rules</h2>
            {rules.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center text-sm text-muted-foreground">
                Start with a template. Every rule is allowlisted, rate-limited, and audited.
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="glass-card rounded-xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${rule.enabled ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                        <span className="font-semibold">{rule.name}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {rule.trigger.type === "schedule"
                          ? `${rule.trigger.cadence} schedule`
                          : `when ${rule.trigger.event || "event"} fires`}
                        {" · "}{rule.actions.length} action(s) · {rule.runCount} runs
                      </p>
                      {rule.runs[0] && (
                        <p className={`mt-1 text-xs ${rule.runs[0].status === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}>
                          Last: {rule.runs[0].status.toLowerCase()}
                          {rule.runs[0].error ? ` — ${rule.runs[0].error}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => test(rule)}>
                        <FlaskConical size={13} className="mr-1" /> Test
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(rule)}>
                        <Power size={14} className={rule.enabled ? "text-emerald-500" : ""} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeRule(rule.id)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      ) : (
        <section className="space-y-4">
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <h2 className="font-semibold">Outbound webhook</h2>
            <div className="flex gap-2">
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.example.com/lifeflow" />
              <Button onClick={addWebhook}><Plus size={14} className="mr-1" /> Add</Button>
            </div>
            {newSecret && (
              <div className="rounded-xl bg-amber-500/10 p-3 text-xs">
                Copy this signing secret now; it will not be shown again:
                <code className="mt-1 block break-all">{newSecret}</code>
              </div>
            )}
          </div>
          {webhooks.map((hook) => (
            <div key={hook.id} className="glass-card rounded-xl p-4 flex justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm">{hook.url}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(hook.events || []).join(", ")} · {hook._count?.deliveries || 0} delivery attempts
                </div>
              </div>
              <button onClick={() => removeWebhook(hook.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
