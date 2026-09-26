"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import { captureOrQueue, type OutboxItem } from "@/lib/offline-outbox";
import { Button } from "@/components/ui/button";

const OPTIONS: Record<
  "knowledge" | "task" | "expense",
  { label: string; path: string; placeholder: string }
> = {
  knowledge: { label: "Note / URL", path: "/api/knowledge", placeholder: "Paste a URL or capture a thought…" },
  task: { label: "Task", path: "/api/tasks", placeholder: "What needs to be done?" },
  expense: { label: "Expense", path: "/api/expenses", placeholder: "Spent ₹450 on lunch…" },
};

export function QuickCaptureFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<keyof typeof OPTIONS>("knowledge");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/s/")
  ) return null;

  async function capture() {
    if (!value.trim()) return;
    const config = OPTIONS[type];
    const payload =
      type === "knowledge"
        ? { input: value.trim() }
        : type === "task"
          ? { title: value.trim() }
          : { text: value.trim() };
    const result = await captureOrQueue(type as OutboxItem["type"], config.path, payload);
    setMessage("queuedOffline" in result ? "Saved offline — will sync automatically." : "Captured.");
    setValue("");
    setTimeout(() => {
      setOpen(false);
      setMessage("");
    }, 1200);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full gradient-bg text-white shadow-xl md:hidden"
        aria-label="Quick capture"
      >
        <Plus size={22} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[95] flex items-end bg-black/50 p-3 md:items-center md:justify-center" onClick={() => setOpen(false)}>
          <div className="w-full rounded-2xl border border-border bg-card p-4 md:max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Quick capture</h2>
              <button onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="mb-3 flex gap-2">
              {(Object.keys(OPTIONS) as Array<keyof typeof OPTIONS>).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={type === option ? "default" : "outline"}
                  onClick={() => setType(option)}
                >
                  {OPTIONS[option].label}
                </Button>
              ))}
            </div>
            <textarea
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={OPTIONS[type].placeholder}
              className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
            {message && <p className="mt-2 text-xs text-primary">{message}</p>}
            <Button className="mt-3 w-full" onClick={capture} disabled={!value.trim()}>
              Capture
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
