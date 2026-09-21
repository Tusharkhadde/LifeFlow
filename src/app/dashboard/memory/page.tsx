"use client";

import { useEffect, useState } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Memory {
  id: string;
  key: string;
  value: string;
  source?: string | null;
  updatedAt: string;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  async function load() {
    const res = await fetch("/api/memory");
    if (res.ok) setMemories((await res.json()).memories || []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!key.trim() || !value.trim()) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setKey("");
    setValue("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain size={28} /> Personal memory
        </h1>
        <p className="text-muted-foreground mt-1">Facts the AI remembers about you across web and Telegram.</p>
      </div>

      <div className="glass-card rounded-2xl p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key — timezone, project, preference" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
        <Button onClick={add}><Plus size={14} className="mr-1" /> Remember</Button>
      </div>

      <div className="space-y-2">
        {memories.map((memory) => (
          <div key={memory.id} className="glass-card rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{memory.key}</div>
              <div className="text-sm text-muted-foreground">{memory.value}</div>
            </div>
            <button onClick={() => remove(memory.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
