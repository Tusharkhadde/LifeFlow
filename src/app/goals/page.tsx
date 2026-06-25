"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Plus,
  CheckCircle,
  TrendingUp,
  Sparkles,
  BookOpen,
  Dumbbell,
  Wallet,
} from "lucide-react";

const goalIcons: Record<string, React.ElementType> = {
  education: BookOpen,
  health: Dumbbell,
  finance: Wallet,
  personal: Target,
};

const goalColors: Record<string, string> = {
  education: "bg-indigo-500",
  health: "bg-green-500",
  finance: "bg-yellow-500",
  personal: "bg-primary",
};

export default function GoalsPage() {
  const { goals, refreshAll } = useData();
  const { language } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: "",
    target: "",
    unit: "",
    category: "personal",
    deadline: "",
  });

  const activeGoals = goals.filter((g) => !g.completed);

  const addGoal = async () => {
    if (!newGoal.title) return;
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newGoal.title,
          target: newGoal.target || "100",
          unit: newGoal.unit || "units",
          category: newGoal.category,
          deadline: newGoal.deadline || null,
        }),
      });
      await refreshAll();
      setNewGoal({ title: "", target: "", unit: "", category: "personal", deadline: "" });
      setShowAdd(false);
    } catch (e) {
      console.error("Failed to add goal", e);
    }
  };

  const updateProgress = async (goalId: string, increment: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const newCurrent = Math.min(goal.current + increment, goal.target || Infinity);
    try {
      await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: goalId,
          current: newCurrent.toString(),
          completed: goal.target ? newCurrent >= goal.target : false,
        }),
      });
      await refreshAll();
    } catch (e) {
      console.error("Failed to update goal", e);
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      await fetch(`/api/goals?id=${goalId}`, { method: "DELETE" });
      await refreshAll();
    } catch (e) {
      console.error("Failed to delete goal", e);
    }
  };

  const getAISuggestion = (goal: typeof goals[0]) => {
    const pct = goal.target ? Math.round((goal.current / goal.target) * 100) : 0;
    const daysLeft = goal.deadline
      ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000)
      : 365;
    const remaining = (goal.target || 0) - goal.current;
    const perDay = daysLeft > 0 ? remaining / daysLeft : remaining;

    if (pct >= 80) return "Almost there! Keep up the great momentum.";
    if (pct >= 50) return "You're halfway! Maintain this pace.";
    if (pct >= 25) return "Good progress! Try to increase your daily effort.";
    if (daysLeft < 30) return "Time is running short. Consider dedicating more focus.";
    return `You need ${Math.ceil(perDay)} ${goal.unit || "units"}/day to reach your goal.`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("goals", language)}</h1>
          <p className="text-muted-foreground mt-1">
            Track progress and get AI coaching suggestions
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="w-full sm:w-auto">
          <Plus size={18} className="mr-2" />
          {t("addGoal", language)}
        </Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="glass-card">
              <CardHeader>
                <CardTitle>Create New Goal</CardTitle>
              </CardHeader>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium mb-1 block">Goal Title</label>
                    <Input
                      placeholder="e.g., Read 12 books this year"
                      value={newGoal.title}
                      onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Target</label>
                    <Input
                      type="number"
                      placeholder="12"
                      value={newGoal.target}
                      onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Unit</label>
                    <Input
                      placeholder="books"
                      value={newGoal.unit}
                      onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Deadline</label>
                    <Input
                      type="date"
                      value={newGoal.deadline}
                      onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={addGoal}>{t("addGoal", language)}</Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>
                    {t("cancel", language)}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center text-white">
              <Target size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeGoals.length}</p>
              <p className="text-xs text-muted-foreground">{t("activeGoals", language)}</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-500">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{goals.filter((g) => g.completed).length}</p>
              <p className="text-xs text-muted-foreground">{t("completed", language)}</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {goals.length > 0
                  ? Math.round(
                      goals.reduce((sum, g) => {
                        const pct = g.target ? (g.current / g.target) * 100 : 0;
                        return sum + Math.min(pct, 100);
                      }, 0) / goals.length
                    )
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground">Average Progress</p>
            </div>
          </div>
        </div>
      </div>

      {activeGoals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Target size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No active goals</p>
          <p className="text-sm mt-1">Create your first goal to start tracking progress</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <AnimatePresence>
          {activeGoals.map((goal) => {
            const pct = goal.target ? Math.round((goal.current / goal.target) * 100) : 0;
            const Icon = goalIcons[goal.category] || Target;
            const color = goalColors[goal.category] || "bg-primary";

            return (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="glass-card">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="text-white" size={22} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{goal.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {goal.current} / {goal.target} {goal.unit}
                          </p>
                        </div>
                        <Badge variant={pct >= 100 ? "upcoming" : pct >= 50 ? "due-soon" : "urgent"}>
                          {pct}%
                        </Badge>
                      </div>

                      <div className="mt-3">
                        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full ${color} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(pct, 100)}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 p-3 rounded-xl bg-primary/10">
                        <div className="flex items-start gap-2">
                          <Sparkles size={14} className="text-primary mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-primary">
                            {getAISuggestion(goal)}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() => updateProgress(goal.id, 1)}
                          disabled={goal.completed}
                        >
                          +1
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateProgress(goal.id, goal.target ? Math.ceil(goal.target * 0.1) : 10)}
                          disabled={goal.completed}
                        >
                          +10%
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteGoal(goal.id)}
                          className="ml-auto text-red-500"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {goals.filter((g) => g.completed).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" />
            {t("completed", language)} Goals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals
              .filter((g) => g.completed)
              .map((goal) => (
                <div key={goal.id} className="glass-card opacity-70">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-500" />
                    <div>
                      <p className="font-medium line-through">{goal.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {goal.current} / {goal.target} {goal.unit}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
