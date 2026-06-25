export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: string;
  urgency: string;
  dueDate?: string;
  completed: boolean;
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  type: string;
  category: string;
  fileUrl?: string;
  ocrData?: Record<string, unknown>;
  confidence?: number;
  keyDates?: Record<string, unknown>;
  extractedData?: Record<string, unknown>;
  createdAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  source: string;
  receiptUrl?: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: string;
  target?: number;
  current: number;
  unit?: string;
  frequency?: string;
  deadline?: string;
  completed: boolean;
  checkIns?: unknown[];
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  datetime: string;
  recurrence?: string;
  category: string;
  completed: boolean;
  snoozedUntil?: string;
  createdAt: string;
}

export interface Insight {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  dismissed: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export type Language = "en" | "hi" | "mr";
