"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Brain,
  CheckSquare,
  Flame,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  Network,
  Plug,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { captureOrQueue } from "@/lib/offline-outbox";

const ROUTES = [
  { label: "Today", href: "/dashboard/today", icon: LayoutDashboard, keywords: "home command center overview morning os" },
  { label: "Universal Inbox", href: "/dashboard/inbox", icon: Bell, keywords: "triage review gmail telegram" },
  { label: "Projects", href: "/dashboard/projects", icon: Users, keywords: "outcomes hub work" },
  { label: "Knowledge Vault", href: "/dashboard", icon: Brain, keywords: "save note link vault" },
  { label: "Ask AI Brain", href: "/assistant", icon: Sparkles, keywords: "search chat ask" },
  { label: "Meetings", href: "/dashboard/meetings", icon: CheckSquare, keywords: "transcript notes decisions action items" },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare, keywords: "todo" },
  { label: "Reminders", href: "/dashboard/reminders", icon: Bell, keywords: "alert" },
  { label: "Expenses", href: "/dashboard/expenses", icon: IndianRupee, keywords: "money spend" },
  { label: "Habits", href: "/dashboard/habits", icon: Flame, keywords: "streak" },
  { label: "Collections", href: "/dashboard/collections", icon: Brain, keywords: "folders" },
  { label: "Memory", href: "/dashboard/memory", icon: Brain, keywords: "facts remember" },
  { label: "Activity", href: "/dashboard/activity", icon: Network, keywords: "events log" },
  { label: "Integrations", href: "/dashboard/integrations", icon: Plug, keywords: "google notion calendar" },
  { label: "Developer API", href: "/dashboard/developer", icon: KeyRound, keywords: "keys webhook api" },
  { label: "Team", href: "/dashboard/workspace", icon: Users, keywords: "workspace" },
  { label: "Settings", href: "/settings", icon: Settings, keywords: "telegram persona" },
];

export function CommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const hidden = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/s/");

  useEffect(() => {
    if (hidden) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ROUTES;
    return ROUTES.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q));
  }, [query]);

  async function runQuickAction() {
    const text = query.trim();
    if (!text) return;
    setBusy(true);
    try {
      if (/morning|start my day|plan my day/i.test(text)) {
        await fetch("/api/morning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notifyTelegram: true }),
        });
        router.push("/dashboard/today");
      } else if (/^https?:\/\//i.test(text) || text.length > 12) {
        await captureOrQueue("knowledge", "/api/knowledge", { input: text });
        router.push("/dashboard");
      } else if (/spent|₹|\d+/.test(text)) {
        await captureOrQueue("expense", "/api/expenses", { text });
        router.push("/dashboard/expenses");
      } else {
        await captureOrQueue("task", "/api/tasks", { title: text });
        router.push("/dashboard/tasks");
      }
      setOpen(false);
      setQuery("");
    } finally {
      setBusy(false);
    }
  }

  if (hidden || !open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-[12vh] w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={16} className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0] && !query.includes(" ")) {
                router.push(results[0].href);
                setOpen(false);
              } else if (event.key === "Enter") {
                void runQuickAction();
              }
            }}
            placeholder="Jump to a page, paste a URL, or type a task…"
            className="w-full bg-transparent py-4 text-sm outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.map((item) => (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"
            >
              <item.icon size={16} className="text-primary" />
              {item.label}
            </button>
          ))}
          {query.trim() && (
            <button
              onClick={() => void runQuickAction()}
              disabled={busy}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-primary hover:bg-primary/10"
            >
              <Sparkles size={16} />
              {busy ? "Working…" : `Quick capture: “${query.trim()}”`}
            </button>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Ctrl/⌘ K to toggle · Enter to go or capture
        </div>
      </div>
    </div>
  );
}
