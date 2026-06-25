"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { formatDate, getDaysUntil } from "@/lib/utils";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Plus,
  CheckCircle,
  Clock,
  Trash2,
  Repeat,
  Sparkles,
} from "lucide-react";

function parseNaturalLanguage(text: string): { title: string; datetime: string; category: string } {
  const now = new Date();
  const datetime = new Date(now);
  let category = "general";
  let title = text;

  const lower = text.toLowerCase();

  if (lower.includes("tomorrow")) {
    datetime.setDate(datetime.getDate() + 1);
    datetime.setHours(9, 0, 0, 0);
    title = title.replace(/tomorrow/i, "").trim();
  } else if (lower.includes("next week")) {
    datetime.setDate(datetime.getDate() + 7);
    datetime.setHours(9, 0, 0, 0);
    title = title.replace(/next week/i, "").trim();
  } else if (lower.includes("today")) {
    datetime.setHours(18, 0, 0, 0);
    title = title.replace(/today/i, "").trim();
  } else if (lower.includes("in ") && lower.includes(" hours")) {
    const match = lower.match(/in (\d+) hours?/);
    if (match) {
      datetime.setHours(datetime.getHours() + parseInt(match[1]));
      title = title.replace(/in \d+ hours?/i, "").trim();
    }
  } else if (lower.includes("in ") && lower.includes(" days")) {
    const match = lower.match(/in (\d+) days?/);
    if (match) {
      datetime.setDate(datetime.getDate() + parseInt(match[1]));
      datetime.setHours(9, 0, 0, 0);
      title = title.replace(/in \d+ days?/i, "").trim();
    }
  } else {
    datetime.setHours(9, 0, 0, 0);
  }

  if (lower.includes("pay") || lower.includes("bill") || lower.includes("rent")) {
    category = "bill";
  } else if (lower.includes("appointment") || lower.includes("doctor")) {
    category = "health";
  } else if (lower.includes("study") || lower.includes("assignment") || lower.includes("college")) {
    category = "education";
  } else if (lower.includes("buy") || lower.includes("shop")) {
    category = "shopping";
  }

  title = title.replace(/^(remind me to |remind me |please |can you )/i, "").trim();
  if (!title) title = text;

  return { title, datetime: datetime.toISOString(), category };
}

export default function RemindersPage() {
  const { reminders, refreshAll } = useData();
  const { language } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [naturalInput, setNaturalInput] = useState("");
  const [parsedPreview, setParsedPreview] = useState<{
    title: string;
    datetime: string;
    category: string;
  } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualReminder, setManualReminder] = useState({
    title: "",
    datetime: "",
    category: "general",
    recurrence: "",
  });

  const handleParse = () => {
    if (!naturalInput.trim()) return;
    const parsed = parseNaturalLanguage(naturalInput);
    setParsedPreview(parsed);
  };

  const confirmReminder = async () => {
    if (!parsedPreview) return;
    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsedPreview.title,
          datetime: parsedPreview.datetime,
          category: parsedPreview.category,
        }),
      });
      await refreshAll();
      setNaturalInput("");
      setParsedPreview(null);
      setShowAdd(false);
    } catch (e) {
      console.error("Failed to add reminder", e);
    }
  };

  const addManualReminder = async () => {
    if (!manualReminder.title || !manualReminder.datetime) return;
    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualReminder.title,
          datetime: new Date(manualReminder.datetime).toISOString(),
          category: manualReminder.category,
          recurrence: manualReminder.recurrence || null,
        }),
      });
      await refreshAll();
      setManualReminder({ title: "", datetime: "", category: "general", recurrence: "" });
      setShowAdd(false);
    } catch (e) {
      console.error("Failed to add reminder", e);
    }
  };

  const completeReminder = async (id: string) => {
    try {
      await fetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed: true }),
      });
      await refreshAll();
    } catch (e) {
      console.error("Failed to complete reminder", e);
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
      await refreshAll();
    } catch (e) {
      console.error("Failed to delete reminder", e);
    }
  };

  const pendingReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("reminders", language)}</h1>
          <p className="text-muted-foreground mt-1">
            Natural language scheduling for your life
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="w-full sm:w-auto">
          <Plus size={18} className="mr-2" />
          {t("addReminder", language)}
        </Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="glass-card border-primary/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles size={18} className="text-primary" />
                    {t("addReminder", language)}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setManualMode(!manualMode)}
                  >
                    {manualMode ? "Natural Language" : "Manual Mode"}
                  </Button>
                </div>
              </CardHeader>
              <div className="p-4">
                {!manualMode ? (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("typeNaturalLanguage", language)}
                        value={naturalInput}
                        onChange={(e) => setNaturalInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleParse()}
                        className="flex-1"
                      />
                      <Button onClick={handleParse}>Parse</Button>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/50 text-sm">
                      <p className="text-muted-foreground mb-2">Try examples:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "Remind me to collect my calculator before college tomorrow",
                          "Pay rent on 1st of every month",
                          "Doctor appointment in 3 days",
                        ].map((example) => (
                          <button
                            key={example}
                            onClick={() => setNaturalInput(example)}
                            className="text-xs px-2 py-1 rounded-lg bg-background hover:bg-muted transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>

                    {parsedPreview && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl border border-primary/30 space-y-2"
                      >
                        <p className="text-sm">
                          <span className="font-medium">Task:</span> {parsedPreview.title}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">When:</span>{" "}
                          {formatDate(parsedPreview.datetime)}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">Category:</span> {parsedPreview.category}
                        </p>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={confirmReminder}>
                            <CheckCircle size={14} className="mr-1" />
                            Confirm & Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setParsedPreview(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Title</label>
                        <Input
                          placeholder="What to remind?"
                          value={manualReminder.title}
                          onChange={(e) =>
                            setManualReminder({ ...manualReminder, title: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Date & Time</label>
                        <Input
                          type="datetime-local"
                          value={manualReminder.datetime}
                          onChange={(e) =>
                            setManualReminder({ ...manualReminder, datetime: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Category</label>
                        <select
                          className="flex h-10 w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm"
                          value={manualReminder.category}
                          onChange={(e) =>
                            setManualReminder({ ...manualReminder, category: e.target.value })
                          }
                        >
                          <option value="general">General</option>
                          <option value="bill">Bill</option>
                          <option value="health">Health</option>
                          <option value="education">Education</option>
                          <option value="shopping">Shopping</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Recurrence</label>
                        <select
                          className="flex h-10 w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm"
                          value={manualReminder.recurrence}
                          onChange={(e) =>
                            setManualReminder({ ...manualReminder, recurrence: e.target.value })
                          }
                        >
                          <option value="">None</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={addManualReminder}>{t("addReminder", language)}</Button>
                      <Button variant="outline" onClick={() => setShowAdd(false)}>
                        {t("cancel", language)}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <Bell size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingReminders.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-500">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {pendingReminders.filter((r) => getDaysUntil(r.datetime) <= 1).length}
              </p>
              <p className="text-xs text-muted-foreground">Due Today/Tomorrow</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-500">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedReminders.length}</p>
              <p className="text-xs text-muted-foreground">{t("completed", language)}</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">
          {t("upcomingReminders", language)}
        </h2>
        <div className="space-y-3">
          <AnimatePresence>
            {pendingReminders
              .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
              .map((reminder) => {
                const days = getDaysUntil(reminder.datetime);
                const isUrgent = days <= 0;
                const isSoon = days <= 1;

                return (
                  <motion.div
                    key={reminder.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                  >
                    <div className={`glass-card ${isUrgent ? "border-red-200 dark:border-red-800" : ""}`}>
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isUrgent
                              ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                              : isSoon
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-500"
                              : "bg-blue-100 dark:bg-blue-900/30 text-blue-500"
                          }`}
                        >
                          <Bell size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-medium">{reminder.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(reminder.datetime)}
                                {reminder.recurrence && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    <Repeat size={12} />
                                    {reminder.recurrence}
                                  </span>
                                )}
                              </p>
                            </div>
                            {isUrgent && <Badge variant="urgent">Overdue</Badge>}
                            {isSoon && !isUrgent && <Badge variant="due-soon">Soon</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => completeReminder(reminder.id)}
                            className="text-green-500"
                          >
                            <CheckCircle size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteReminder(reminder.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
          {pendingReminders.length === 0 && (
            <div className="glass-card">
              <div className="text-center py-8 text-muted-foreground">
                <Bell size={32} className="mx-auto mb-3 opacity-50" />
                <p>No pending reminders</p>
                <p className="text-sm mt-1">Add one using natural language!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
