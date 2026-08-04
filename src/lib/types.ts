export interface KnowledgeItem {
  id: string;
  userId: string;
  title: string;
  summary?: string | null;
  aiMemory?: string | null;
  type: "link" | "note" | "document" | "audio";
  sourceUrl?: string | null;
  favicon?: string | null;
  category: string;
  tags?: string[] | null;
  favorite: boolean;
  archived: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export type Language = "en" | "hi" | "mr";
