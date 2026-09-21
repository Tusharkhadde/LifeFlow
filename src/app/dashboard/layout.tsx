"use client";

import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
