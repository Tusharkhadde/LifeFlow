"use client";

import { useState, useMemo } from "react";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  AlertTriangle,
  Plus,
  Trash2,
  PieChart,
  DollarSign,
  Sparkles,
  Lightbulb,
} from "lucide-react";

const categories = [
  { value: "food", label: "Food", color: "bg-orange-500" },
  { value: "transport", label: "Transport", color: "bg-blue-500" },
  { value: "subscriptions", label: "Subscriptions", color: "bg-purple-500" },
  { value: "utilities", label: "Utilities", color: "bg-yellow-500" },
  { value: "shopping", label: "Shopping", color: "bg-pink-500" },
  { value: "health", label: "Health", color: "bg-green-500" },
  { value: "education", label: "Education", color: "bg-indigo-500" },
  { value: "other", label: "Other", color: "bg-gray-500" },
];

const budget = 25000;

export default function ExpensesPage() {
  const { expenses, refreshAll } = useData();
  const { language } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [newExpense, setNewExpense] = useState({
    amount: "",
    category: "food",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  const thisMonth = useMemo(() => {
    const now = new Date();
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [expenses]);

  const lastMonth = useMemo(() => {
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
    });
  }, [expenses]);

  const totalThisMonth = thisMonth.reduce((sum, e) => sum + e.amount, 0);
  const totalLastMonth = lastMonth.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    thisMonth.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        percentage: totalThisMonth > 0 ? Math.round((amount / totalThisMonth) * 100) : 0,
      }));
  }, [thisMonth, totalThisMonth]);

  const anomalies = useMemo(() => {
    const results: { message: string; severity: string }[] = [];
    const lastMonthByCategory: Record<string, number> = {};
    lastMonth.forEach((e) => {
      lastMonthByCategory[e.category] = (lastMonthByCategory[e.category] || 0) + e.amount;
    });
    thisMonth.forEach((e) => {
      const last = lastMonthByCategory[e.category] || 0;
      if (last > 0) {
        const change = ((e.amount - last) / last) * 100;
        if (change > 20) {
          results.push({
            message: `${e.category} spending up ${Math.round(change)}% (₹${e.amount.toLocaleString()} vs ₹${last.toLocaleString()})`,
            severity: "warning",
          });
        }
      }
    });
    const totalChange = totalLastMonth > 0
      ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100
      : 0;
    if (totalChange > 15) {
      results.push({
        message: `Total spending up ${Math.round(totalChange)}% compared to last month`,
        severity: "critical",
      });
    }
    return results;
  }, [thisMonth, lastMonth, totalThisMonth, totalLastMonth]);

  const dailySpendRate = totalThisMonth / new Date().getDate();
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate();
  const projectedSpend = dailySpendRate * daysInMonth;
  const daysUntilOverrun =
    budget > totalThisMonth
      ? Math.ceil((budget - totalThisMonth) / dailySpendRate)
      : 0;

  const spendingTips = useMemo(() => {
    const tips: string[] = [];
    const foodSpend = thisMonth
      .filter((e) => e.category === "food")
      .reduce((s, e) => s + e.amount, 0);
    if (foodSpend > 3000) {
      tips.push(`Cut food delivery by 2x/week to save ~₹${Math.round(foodSpend * 0.2).toLocaleString()}/month`);
    }
    const subSpend = thisMonth
      .filter((e) => e.category === "subscriptions")
      .reduce((s, e) => s + e.amount, 0);
    if (subSpend > 1500) {
      tips.push("Review subscriptions — cancel unused services to save more");
    }
    if (projectedSpend > budget) {
      tips.push(`At current pace, you may exceed budget by ₹${Math.round(projectedSpend - budget).toLocaleString()}`);
    }
    if (tips.length === 0) {
      tips.push("You're doing great! Keep tracking your expenses.");
    }
    return tips;
  }, [thisMonth, projectedSpend]);

  const addExpense = async () => {
    if (!newExpense.amount) return;
    try {
      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: newExpense.amount,
          category: newExpense.category,
          description: newExpense.description,
          date: newExpense.date,
        }),
      });
      await refreshAll();
      setNewExpense({ amount: "", category: "food", description: "", date: new Date().toISOString().split("T")[0] });
      setShowAdd(false);
    } catch (e) {
      console.error("Failed to add expense", e);
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      await refreshAll();
    } catch (e) {
      console.error("Failed to delete expense", e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("expenses", language)}</h1>
          <p className="text-muted-foreground mt-1">
            Smart expense tracking with AI insights
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="w-full sm:w-auto">
          <Plus size={18} className="mr-2" />
          Add Expense
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
                <CardTitle>Add New Expense</CardTitle>
              </CardHeader>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Amount (₹)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Category</label>
                    <select
                      className="flex h-10 w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm backdrop-blur-sm"
                      value={newExpense.category}
                      onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Description</label>
                    <Input
                      placeholder="What was it for?"
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Date</label>
                    <Input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={addExpense}>Add Expense</Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-500">
              <DollarSign size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(totalThisMonth)}</p>
              <p className="text-xs text-muted-foreground">{t("thisMonth", language)}</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(budget)}</p>
              <p className="text-xs text-muted-foreground">{t("budget", language)}</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-500">
              <PieChart size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(projectedSpend)}</p>
              <p className="text-xs text-muted-foreground">Projected Total</p>
            </div>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${projectedSpend > budget ? "bg-red-100 dark:bg-red-900/30 text-red-500" : "bg-green-100 dark:bg-green-900/30 text-green-500"}`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {projectedSpend > budget ? "Over" : `${daysUntilOverrun}d`}
              </p>
              <p className="text-xs text-muted-foreground">
                {projectedSpend > budget ? "Budget exceeded" : "Until budget overrun"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart size={16} className="text-primary" />
              Spending by Category
            </CardTitle>
          </CardHeader>
          <div className="p-4 space-y-3">
            {byCategory.map((item) => {
              const cat = categories.find((c) => c.value === item.category);
              return (
                <div key={item.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${cat?.color || "bg-gray-500"}`} />
                      {cat?.label || item.category}
                    </span>
                    <span className="font-medium">{formatCurrency(item.amount)} ({item.percentage}%)</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${cat?.color || "bg-gray-500"} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.percentage}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              {t("savingsTips", language)}
            </CardTitle>
          </CardHeader>
          <div className="p-4 space-y-3">
            {spendingTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                <Lightbulb size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="glass-card border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              {t("anomalies", language)}
            </CardTitle>
          </CardHeader>
          <div className="p-4 space-y-2">
            {anomalies.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10"
              >
                <AlertTriangle size={14} className="text-orange-500" />
                <p className="text-sm">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <div className="p-4">
          {thisMonth.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No expenses this month</p>
              <p className="text-sm mt-1">Start tracking by adding your first expense</p>
            </div>
          ) : (
            <div className="space-y-2">
              {thisMonth.slice(0, 10).map((expense) => {
                const cat = categories.find((c) => c.value === expense.category);
                return (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${cat?.color || "bg-gray-500"}`} />
                      <div>
                        <p className="font-medium text-sm">{expense.description || expense.category}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(expense.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                      <Button variant="ghost" size="icon" onClick={() => deleteExpense(expense.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
