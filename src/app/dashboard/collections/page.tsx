"use client";

import { useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Collection {
  id: string;
  name: string;
  color: string;
  auto: boolean;
  itemIds: unknown;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<{ name: string; items: Array<{ id: string; title: string }> } | null>(null);

  async function load() {
    const res = await fetch("/api/collections");
    if (res.ok) setCollections((await res.json()).collections || []);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    await load();
  }

  async function organize() {
    await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/collections?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function open(id: string) {
    const res = await fetch(`/api/collections?id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelected({ name: data.collection?.name || "Collection", items: data.items || [] });
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FolderKanban size={28} /> Collections
        </h1>
        <p className="text-muted-foreground mt-1">Group vault items by theme, or let AI auto-organize them.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection name" className="max-w-xs" />
        <Button onClick={create}><Plus size={14} className="mr-1" /> Create</Button>
        <Button variant="outline" onClick={organize}><Wand2 size={14} className="mr-1" /> Auto-organize</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {collections.map((collection) => {
          const count = Array.isArray(collection.itemIds) ? collection.itemIds.length : 0;
          return (
            <div key={collection.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => open(collection.id)} className="text-left">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: collection.color }} />
                    {collection.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{count} items {collection.auto ? "· auto" : ""}</div>
                </button>
                <button onClick={() => remove(collection.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="glass-card rounded-2xl p-5">
          <h2 className="font-semibold mb-3">{selected.name}</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {selected.items.length === 0 ? <li>No items in this collection yet.</li> : selected.items.map((item) => <li key={item.id}>• {item.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
