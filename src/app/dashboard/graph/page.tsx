"use client";

import { useEffect, useState } from "react";
import { Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  color?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

const TYPE_COLORS: Record<string, string> = {
  entity: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  knowledge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  expense: "bg-red-500/20 text-red-400 border-red-500/30",
  habit: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  category: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/graph");
    if (res.ok) {
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function organize() {
    await fetch("/api/collections", { method: "POST" });
    await load();
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Network size={28} /> Knowledge Graph</h1>
          <p className="text-muted-foreground mt-1">{nodes.length} nodes, {edges.length} connections</p>
        </div>
        <Button variant="outline" onClick={organize}><RefreshCw size={16} className="mr-1" /> Auto-organize</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading graph…</p>
      ) : nodes.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
          Save knowledge, log expenses, or describe relationships to build your graph.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {nodes.slice(0, 40).map((node) => (
              <span key={node.id} className={`rounded-full border px-3 py-1 text-xs ${TYPE_COLORS[node.type] || "bg-muted"}`}>
                {node.label}
              </span>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-2 max-h-[500px] overflow-y-auto">
            <h3 className="font-semibold mb-3">Relationships</h3>
            {edges.slice(0, 50).map((edge, i) => (
              <div key={i} className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{nodeMap[edge.source]?.label || edge.source}</span>
                <span className="text-primary text-xs">→ {edge.label} →</span>
                <span className="font-medium text-foreground">{nodeMap[edge.target]?.label || edge.target}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
