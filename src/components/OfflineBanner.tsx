"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushOfflineItems, listOfflineItems } from "@/lib/offline-outbox";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    setOnline(navigator.onLine);
    listOfflineItems().then((items) => setPending(items.length)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("lifeflow-outbox", refresh);
    navigator.serviceWorker?.addEventListener("message", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("lifeflow-outbox", refresh);
      navigator.serviceWorker?.removeEventListener("message", refresh);
    };
  }, [refresh]);

  if (online && pending === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-xs shadow-xl">
      <CloudOff size={14} className={online ? "text-amber-500" : "text-destructive"} />
      <span>
        {online ? `${pending} capture${pending === 1 ? "" : "s"} waiting to sync` : `Offline · ${pending} saved locally`}
      </span>
      {online && pending > 0 && (
        <button
          onClick={() => {
            flushOfflineItems();
            setTimeout(refresh, 1000);
          }}
          className="flex items-center gap-1 text-primary"
        >
          <RefreshCw size={12} /> Sync
        </button>
      )}
    </div>
  );
}
