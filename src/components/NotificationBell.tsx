"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  href?: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.notifications || []);
    setUnread(data.unread || 0);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
        )}
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-50 w-72 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">Notifications</span>
            <button onClick={markAll} className="text-primary">Mark all read</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notifications yet.</p>
            ) : (
              items.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={item.href || "/dashboard/activity"}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl p-2 text-xs ${item.read ? "text-muted-foreground" : "bg-primary/5"}`}
                >
                  <div className="font-medium text-foreground">{item.title}</div>
                  <div>{item.message}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
