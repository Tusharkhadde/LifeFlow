"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Task, Document, Expense, Goal, Reminder, Insight } from "@/lib/types";

interface DataContextType {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  insights: Insight[];
  setInsights: React.Dispatch<React.SetStateAction<Insight[]>>;
  loading: boolean;
  refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  tasks: [],
  setTasks: () => {},
  documents: [],
  setDocuments: () => {},
  expenses: [],
  setExpenses: () => {},
  goals: [],
  setGoals: () => {},
  reminders: [],
  setReminders: () => {},
  insights: [],
  setInsights: () => {},
  loading: true,
  refreshAll: async () => {},
});

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, docRes, expRes, goalRes, remRes, insRes] = await Promise.allSettled([
        fetchJSON<{ tasks: Task[] }>("/api/tasks"),
        fetchJSON<{ documents: Document[] }>("/api/documents"),
        fetchJSON<{ expenses: Expense[] }>("/api/expenses"),
        fetchJSON<{ goals: Goal[] }>("/api/goals"),
        fetchJSON<{ reminders: Reminder[] }>("/api/reminders"),
        fetchJSON<{ insights: Insight[] }>("/api/insights"),
      ]);

      if (taskRes.status === "fulfilled") setTasks(taskRes.value.tasks);
      if (docRes.status === "fulfilled") setDocuments(docRes.value.documents);
      if (expRes.status === "fulfilled") setExpenses(expRes.value.expenses);
      if (goalRes.status === "fulfilled") setGoals(goalRes.value.goals);
      if (remRes.status === "fulfilled") setReminders(remRes.value.reminders);
      if (insRes.status === "fulfilled") setInsights(insRes.value.insights);
    } catch {
      // Silently fail - show empty states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <DataContext.Provider value={{
      tasks, setTasks,
      documents, setDocuments,
      expenses, setExpenses,
      goals, setGoals,
      reminders, setReminders,
      insights, setInsights,
      loading,
      refreshAll,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
