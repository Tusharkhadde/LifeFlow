"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Workspace {
  id: string;
  name: string;
  inviteCode: string;
  members?: Array<{ user: { name?: string | null; email: string } }>;
}

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [feed, setFeed] = useState<{ knowledge: Array<{ title: string }>; expenses: Array<{ amount: number }>; memberCount: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (res.ok) {
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createWs() {
    if (!name.trim()) return;
    await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName("");
    await load();
  }

  async function joinWs() {
    await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", inviteCode }) });
    setInviteCode("");
    await load();
  }

  async function viewFeed(id: string) {
    setSelectedId(id);
    const res = await fetch(`/api/workspaces?id=${id}`);
    if (res.ok) setFeed(await res.json());
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Users size={28} /> Team & Family</h1>
        <p className="text-muted-foreground mt-1">Shared vault, expenses, and tasks across members.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold">Create workspace</h3>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Family, Team, etc." />
          <Button onClick={createWs}><Plus size={14} className="mr-1" /> Create</Button>
        </div>
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold">Join with invite code</h3>
          <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="ABCD1234" />
          <Button variant="outline" onClick={joinWs}>Join</Button>
        </div>
      </div>

      <div className="space-y-3">
        {workspaces.map((ws) => (
          <div key={ws.id} className="glass-card rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{ws.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                Code: {ws.inviteCode}
                <button onClick={() => navigator.clipboard.writeText(ws.inviteCode)} className="text-primary"><Copy size={12} /></button>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => viewFeed(ws.id)}>View feed</Button>
          </div>
        ))}
      </div>

      {feed && selectedId && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold">Shared feed ({feed.memberCount} members)</h3>
          <p className="text-sm">{feed.knowledge.length} knowledge items · {feed.expenses.length} recent expenses</p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {feed.knowledge.slice(0, 5).map((k, i) => <li key={i}>• {k.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
