"use client";

import { BookOpen, ExternalLink, Globe } from "lucide-react";
import type { Citation } from "@/lib/citations";

export function CitationPanel({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  const vault = citations.filter((citation) => citation.kind === "vault");
  const web = citations.filter((citation) => citation.kind === "web");
  return (
    <details className="rounded-xl border border-border bg-background/60 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-primary">
        Sources ({citations.length})
      </summary>
      <div className="mt-3 space-y-3">
        {vault.length > 0 && <CitationGroup label="Your vault" citations={vault} icon="vault" />}
        {web.length > 0 && <CitationGroup label="Web" citations={web} icon="web" />}
      </div>
    </details>
  );
}

function CitationGroup({
  label,
  citations,
  icon,
}: {
  label: string;
  citations: Citation[];
  icon: "vault" | "web";
}) {
  const Icon = icon === "vault" ? BookOpen : Globe;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 font-semibold">
        <Icon size={12} /> {label}
      </div>
      <div className="space-y-1.5">
        {citations.map((citation, index) => {
          const content = (
            <>
              <div className="flex items-center gap-1 font-medium">
                <span className="text-muted-foreground">[{index + 1}]</span>
                <span className="truncate">{citation.title}</span>
                {citation.url && <ExternalLink size={10} />}
                {citation.score !== undefined && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {Math.round(citation.score * 100)}%
                  </span>
                )}
              </div>
              {citation.snippet && (
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {citation.snippet}
                </p>
              )}
            </>
          );
          return citation.url ? (
            <a
              key={citation.id}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border p-2 hover:border-primary/40"
            >
              {content}
            </a>
          ) : (
            <div key={citation.id} className="rounded-lg border border-border p-2">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
