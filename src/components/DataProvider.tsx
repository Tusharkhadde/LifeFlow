"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeItem } from "@/lib/types";

interface DataContextType {
  knowledgeItems: KnowledgeItem[];
  setKnowledgeItems: React.Dispatch<React.SetStateAction<KnowledgeItem[]>>;
  loading: boolean;
  refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  knowledgeItems: [],
  setKnowledgeItems: () => {},
  loading: true,
  refreshAll: async () => {},
});

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJSON<{ items: KnowledgeItem[] }>("/api/knowledge");
      if (res?.items) {
        setKnowledgeItems(res.items);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        setShouldRedirect(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      refreshAll();
    }
  }, [mounted, refreshAll]);

  useEffect(() => {
    if (shouldRedirect) {
      router.push("/login");
    }
  }, [shouldRedirect, router]);

  return (
    <DataContext.Provider
      value={{
        knowledgeItems,
        setKnowledgeItems,
        loading: loading && !mounted,
        refreshAll,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
