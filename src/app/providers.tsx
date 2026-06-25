"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { DataProvider } from "@/components/DataProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <DataProvider>
          {children}
        </DataProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
