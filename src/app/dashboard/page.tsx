"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { getUrgencyTag, calculatePriorityScore, formatDate } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { KineticTextLoader } from "@/components/ui/kinetic-text-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Pause,
  Sparkles,
  AlertTriangle,
  Receipt,
  Target,
  Calendar,
  FileText,
  RefreshCw,
  Heart,
  BookOpen,
  Zap,
} from "lucide-react";

const categoryIcons: Record<string, React.ElementType> = {
  bill: Receipt,
  document: FileText,
  appointment: Calendar,
  goal: Target,
  subscription: RefreshCw,
  health: Heart,
  education: BookOpen,
  general: Clock,
  insurance: Shield,
};

function Shield(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

export default function DashboardPage() {
  const { tasks, expenses, goals, reminders, insights, loading, refreshAll } = useData();
  const { language } = useLanguage();
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<string[]>([]);

  const sortedTasks = [...tasks]
    .filter((t) => !t.completed)
    .sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));

  const todayTasks = sortedTasks.filter((t) => {
    if (!t.dueDate) return false;
    const days = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
    return days <= 1;
  });

  const totalExpensesThisMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const activeGoals = goals.filter((g) => !g.completed);
  const pendingReminders = reminders.filter((r) => !r.completed);

  const handleGenerateDay = async () => {
    setGeneratingPlan(true);
    await new Promise((r) => setTimeout(r, 2000));
    const plan = sortedTasks.slice(0, 5).map((task) => {
      const days = task.dueDate
        ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000)
        : null;
      let reason = "";
      if (days !== null && days < 0) reason = `Overdue by ${Math.abs(days)} days - complete immediately`;
      else if (days !== null && days <= 2) reason = `Due in ${days} day${days > 1 ? "s" : ""} - time-sensitive`;
      else if (task.urgency === "high") reason = "High urgency task - important to address today";
      else reason = "Scheduled for today based on your priorities";
      return `${task.title} - ${reason}`;
    });
    setGeneratedPlan(plan);
    setGeneratingPlan(false);
  };

  const markComplete = async (taskId: string) => {
    try {
      await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, completed: true }),
      });
      await refreshAll();
    } catch (e) {
      console.error("Failed to complete task", e);
    }
  };

  const snoozeTask = async (taskId: string) => {
    try {
      const snoozedUntil = new Date(Date.now() + 86400000).toISOString();
      await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, snoozedUntil }),
      });
      await refreshAll();
    } catch (e) {
      console.error("Failed to snooze task", e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {loading ? (
        <div className="space-y-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("dashboard", language)}</h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Button
          onClick={handleGenerateDay}
          disabled={generatingPlan}
          size="lg"
          className="w-full sm:w-auto gradient-bg text-white"
        >
          {generatingPlan ? (
            <KineticTextLoader text="Thinking" className="scale-50" />
          ) : (
            <>
              <Sparkles size={18} className="mr-2" />
              {t("generateMyDay", language)}
            </>
          )}
        </Button>
      </div>

      {/* AI Generated Plan */}
      <AnimatePresence>
        {generatedPlan.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="glass-card p-6 border border-primary/20">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-primary" />
                Your AI-Generated Day
              </h3>
              <ol className="space-y-2">
                {generatedPlan.map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Tasks", value: todayTasks.length, icon: Clock, color: "text-blue-500" },
          { label: "Monthly Spend", value: totalExpensesThisMonth, icon: Receipt, color: "text-orange-500", prefix: "₹" },
          { label: "Active Goals", value: activeGoals.length, icon: Target, color: "text-green-500" },
          { label: "Pending", value: pendingReminders.length, icon: AlertTriangle, color: "text-red-500" },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold flex items-center">
                  {stat.prefix && <span>{stat.prefix}</span>}
                  <AnimatedNumber value={stat.value} />
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            {t("whatsDueToday", language)}
          </h2>
          <AnimatePresence>
            {sortedTasks.map((task) => {
              const urgencyTag = getUrgencyTag(task.dueDate);
              const Icon = categoryIcons[task.category] || Clock;
              const days = task.dueDate
                ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000)
                : null;

              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={`glass-card p-4 ${task.snoozedUntil ? "opacity-50" : ""}`}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0">
                        <Icon className="text-white" size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-medium">{task.title}</h3>
                            {task.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {urgencyTag === "overdue" && (
                              <Badge variant="destructive">{t("overdue", language)}</Badge>
                            )}
                            {urgencyTag === "due-soon" && (
                              <Badge variant="default" className="bg-orange-500">{t("dueSoon", language)}</Badge>
                            )}
                            {urgencyTag === "upcoming" && (
                              <Badge variant="default" className="bg-primary">{t("upcoming", language)}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="text-xs text-muted-foreground">
                            {days !== null && (
                              <span>
                                {days < 0
                                  ? `${Math.abs(days)} day${Math.abs(days) > 1 ? "s" : ""} overdue`
                                  : days === 0
                                  ? "Due today"
                                  : `Due in ${days} day${days > 1 ? "s" : ""}`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markComplete(task.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle2 size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => snoozeTask(task.id)}
                            >
                              <Pause size={16} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Goal Progress */}
          <div className="glass-card p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Target size={16} className="text-green-500" />
              Goal Progress
            </h3>
            <div className="space-y-3">
              {goals.slice(0, 3).map((goal) => {
                const pct = goal.target ? Math.round((goal.current / goal.target) * 100) : 0;
                return (
                  <div key={goal.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate">{goal.title}</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full gradient-bg rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Insights */}
          <div className="glass-card p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-orange-500" />
              {t("headsUp", language)}
            </h3>
            <div className="space-y-3">
              {insights.slice(0, 3).map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 rounded-xl bg-muted/50 text-sm"
                >
                  <p className="font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reminders */}
          <div className="glass-card p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-blue-500" />
              Upcoming Reminders
            </h3>
            <div className="space-y-2">
              {reminders.slice(0, 3).map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{reminder.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(reminder.datetime)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
        </>
      )}
    </div>
  );
}
