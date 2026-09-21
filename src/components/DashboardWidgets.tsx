"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, IndianRupee, Flame } from "lucide-react";

export function DashboardWidgets() {
  const [expiringDocs, setExpiringDocs] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);
  const [habitStreak, setHabitStreak] = useState(0);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/expenses").then((r) => r.json()),
      fetch("/api/habits").then((r) => r.json()),
      fetch("/api/insights").then((r) => r.json()),
    ]).then(([docs, expenses, habits, insights]) => {
      const now = new Date();
      const expiring = (docs.documents || []).filter((d: { expiryDate?: string }) => {
        if (!d.expiryDate) return false;
        const days = Math.ceil((new Date(d.expiryDate).getTime() - now.getTime()) / 86400000);
        return days >= 0 && days <= 14;
      });
      setExpiringDocs(expiring.length);
      setMonthSpend(expenses.summary?.total || 0);
      const maxStreak = Math.max(0, ...(habits.habits || []).map((h: { streak: number }) => h.streak));
      setHabitStreak(maxStreak);
      setAlerts((insights.proactiveAlerts || []).slice(0, 2).map((a: { message: string }) => a.message));
    });
  }, []);

  const widgets = [
    { label: "Expiring docs", value: expiringDocs, href: "/dashboard/documents", icon: FileText, color: "text-amber-500" },
    { label: "Month spend", value: `₹${Math.round(monthSpend).toLocaleString("en-IN")}`, href: "/dashboard/expenses", icon: IndianRupee, color: "text-emerald-500" },
    { label: "Best streak", value: `${habitStreak}d`, href: "/dashboard/habits", icon: Flame, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-4 mb-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {widgets.map((w) => (
          <Link key={w.label} href={w.href} className="glass-card rounded-xl p-4 hover:border-primary/30 transition-colors">
            <w.icon size={18} className={`${w.color} mb-2`} />
            <div className="text-xl font-bold">{w.value}</div>
            <div className="text-xs text-muted-foreground">{w.label}</div>
          </Link>
        ))}
      </div>
      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm flex gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>{alerts.join(" · ")}</div>
        </div>
      )}
    </div>
  );
}
