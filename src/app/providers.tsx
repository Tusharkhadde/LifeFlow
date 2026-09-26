"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { QuickCaptureFab } from "@/components/QuickCaptureFab";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {children}
        <CommandPalette />
        <PwaRegistrar />
        <OfflineBanner />
        <QuickCaptureFab />
      </LanguageProvider>
    </ThemeProvider>
  );
}
