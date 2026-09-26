"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  createdAt: string;
}

interface ShareLink {
  id: string;
  url: string;
  viewCount: number;
  knowledgeItem?: { title: string };
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [name, setName] = useState("Chrome extension");
  const [origin, setOrigin] = useState("your app URL");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [keysRes, shareRes] = await Promise.all([fetch("/api/keys"), fetch("/api/share")]);
    if (keysRes.ok) setKeys((await keysRes.json()).keys || []);
    if (shareRes.ok) setShares((await shareRes.json()).links || []);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  async function createKey() {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setRawKey(data.key.rawKey);
      setMessage(data.warning);
      await load();
    } else {
      setMessage(data.error);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function importData() {
    try {
      const payload = JSON.parse(importText);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMessage(res.ok ? `Imported ${JSON.stringify(data.imported)}` : data.error);
    } catch {
      setMessage("Paste valid LifeFlow export JSON.");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <KeyRound size={28} /> Developer
        </h1>
        <p className="text-muted-foreground mt-1">API keys, public share links, export, and import — the SaaS surface.</p>
      </div>

      {message && <div className="glass-card rounded-xl p-4 text-sm">{message}</div>}

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">API keys</h2>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" />
          <Button onClick={createKey}>Create key</Button>
        </div>
        {rawKey && (
          <div className="rounded-xl bg-muted p-3 text-xs font-mono break-all flex items-start justify-between gap-2">
            <span>{rawKey}</span>
            <button onClick={() => navigator.clipboard.writeText(rawKey)} className="text-primary"><Copy size={14} /></button>
          </div>
        )}
        <ul className="space-y-2">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between text-sm">
              <span>{key.name} · {key.prefix}…</span>
              <button onClick={() => revoke(key.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto">{`curl -X POST $APP_URL/api/v1/search \\
  -H "Authorization: Bearer lf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"query":"what did I save about React?"}'`}</pre>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Chrome extension</h2>
        <p className="text-sm text-muted-foreground">
          LifeFlow Copilot is a side panel: ask about the current page, save it, clip a selection, or turn notes into tasks. It uses the API key above.
        </p>
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
          <li>Create a key and copy the <span className="font-mono text-xs">lf_live_…</span> value.</li>
          <li>
            <a href="/lifeflow-copilot.zip" className="text-primary underline" download>
              Download the extension
            </a>{" "}
            and unzip it.
          </li>
          <li>Open chrome://extensions, enable Developer mode, then Load unpacked and choose the unzipped folder.</li>
          <li>
            Click the toolbar icon and paste <span className="font-mono text-xs">{origin}</span> plus the key. Use Test connection.
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">Alt+Shift+L opens the panel. Right-click a page or a selection for the same actions.</p>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">MCP server — use LifeFlow from Cursor / Claude</h2>
        <p className="text-sm text-muted-foreground">
          Your second brain is an MCP tool server. Add this to Cursor (<code className="text-xs bg-muted px-1 rounded">.cursor/mcp.json</code>) or Claude Desktop and any AI can search your vault, create tasks, log expenses, and run your morning.
        </p>
        <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto">{`{
  "mcpServers": {
    "lifeflow": {
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app"}/api/mcp",
      "headers": { "Authorization": "Bearer lf_live_..." }
    }
  }
}`}</pre>
        <p className="text-xs text-muted-foreground">
          Tools: search_vault, save_knowledge, create_task, list_tasks, complete_task, create_reminder, log_expense, expense_summary, log_habit, today_overview, run_morning, process_meeting, remember_fact.
        </p>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Share links</h2>
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a public link from a vault card.</p>
        ) : (
          shares.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-3 text-sm">
              <a href={link.url} target="_blank" rel="noreferrer" className="text-primary truncate">{link.knowledgeItem?.title || link.url}</a>
              <span className="text-xs text-muted-foreground">{link.viewCount} views</span>
            </div>
          ))
        )}
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Export / Import</h2>
        <div className="flex gap-2">
          <a href="/api/export?format=json" className="text-sm text-primary underline">Download JSON</a>
          <a href="/api/export?format=markdown" className="text-sm text-primary underline">Download Markdown</a>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='Paste {"knowledge":[],"tasks":[],"expenses":[]}'
          className="w-full min-h-32 rounded-xl border border-border bg-background p-3 text-xs"
        />
        <Button variant="outline" onClick={importData}>Import JSON</Button>
      </section>
    </div>
  );
}
