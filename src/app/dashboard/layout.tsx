"use client";

import { Sidebar } from "@/components/Sidebar";
import { DataProvider } from "@/components/DataProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DataProvider>
      <div className="min-h-screen">
        <Sidebar />
        <main className="lg:ml-64 min-h-screen p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </DataProvider>
  );
}
