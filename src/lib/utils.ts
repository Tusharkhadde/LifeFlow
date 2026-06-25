import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}

export function getDaysUntil(date: Date | string): number {
  const target = new Date(date);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getUrgencyTag(dueDate?: string | null): "overdue" | "due-soon" | "upcoming" | "none" {
  if (!dueDate) return "none";
  const days = getDaysUntil(dueDate);
  if (days < 0) return "overdue";
  if (days <= 3) return "due-soon";
  return "upcoming";
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    bill: "Receipt",
    document: "FileText",
    appointment: "Calendar",
    goal: "Target",
    subscription: "RefreshCw",
    health: "Heart",
    education: "BookOpen",
    general: "Clock",
    food: "Utensils",
    transport: "Car",
    shopping: "ShoppingBag",
    utilities: "Zap",
  };
  return icons[category] || "Circle";
}

export function calculatePriorityScore(task: {
  dueDate?: string | null;
  urgency: string;
  category: string;
}): number {
  let score = 50;
  if (task.dueDate) {
    const days = getDaysUntil(task.dueDate);
    if (days < 0) score += 40;
    else if (days <= 1) score += 30;
    else if (days <= 3) score += 20;
    else if (days <= 7) score += 10;
  }
  if (task.urgency === "high") score += 15;
  else if (task.urgency === "low") score -= 10;
  const highConsequence = ["bill", "subscription", "health"];
  if (highConsequence.includes(task.category)) score += 10;
  return score;
}
