"use client";

import { useEffect, useState } from "react";
import { Search, Globe } from "lucide-react";
import { CitationPanel } from "@/components/CitationPanel";
import type { Citation } from "@/lib/citations";

interface SearchEntry {
  id: string;
  query: string;
  answer?: string | null;
  exaUsed: boolean;
  sourceUrls?: string[] | null;
  citations?: Citation[] | null;
  createdAt: string;
}

export default function SearchHistoryPage() {
  const [history, setHistory] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/search-history")
      .then((r) => r.json())
      .then((d) => setHistory(d.history || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Search History</h1>
        <p className="text-muted-foreground mt-1">Past Exa + vault searches from Telegram and web.</p>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : history.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">No searches yet.</div>
      ) : (
        <ul className="space-y-4">
          {history.map((entry) => (
            <li key={entry.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Search size={16} className="text-primary" />
                <span className="font-semibold">{entry.query}</span>
                {entry.exaUsed && (
                  <span title="Exa search used">
                    <Globe size={14} className="text-blue-400" />
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              {entry.answer && <p className="text-sm text-muted-foreground line-clamp-3">{entry.answer}</p>}
              {entry.citations && <div className="mt-3"><CitationPanel citations={entry.citations} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
