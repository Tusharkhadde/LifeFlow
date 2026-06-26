"use client";

import { Sidebar } from "@/components/Sidebar";
import { DataProvider } from "@/components/DataProvider";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("lifeflow-sidebar-collapsed");
    if (saved !== null) setCollapsed(saved === "true");

    function handleToggle(e: CustomEvent<{ collapsed: boolean }>) {
      setCollapsed(e.detail.collapsed);
    }
    window.addEventListener("sidebar-toggle" as string, handleToggle as EventListener);
    return () => window.removeEventListener("sidebar-toggle" as string, handleToggle as EventListener);
  }, []);

  return (
    <DataProvider>
      <div className="min-h-screen">
        <Sidebar />
        <main
          className={cn(
            "min-h-screen p-4 sm:p-6 lg:p-8 transition-[margin] duration-300",
            collapsed ? "lg:ml-[68px]" : "lg:ml-64"
          )}
        >
          {children}
        </main>
      </div>
    </DataProvider>
  );
}
