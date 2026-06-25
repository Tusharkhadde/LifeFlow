"use client";

import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  AlertTriangle,
  Shield,
  Clock,
  TrendingUp,
  FileText,
  RefreshCw,
  X,
  Eye,
} from "lucide-react";

const insightIcons: Record<string, React.ElementType> = {
  budget: TrendingUp,
  subscription: RefreshCw,
  expiry: FileText,
  health: Shield,
  document: FileText,
};

const insightColors: Record<string, string> = {
  critical: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10",
  warning: "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10",
  info: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10",
};

const insightBadgeColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  warning: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function InsightsPage() {
  const { insights, setInsights } = useData();
  const { language } = useLanguage();

  const dismissInsight = (id: string) => {
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, dismissed: true } : i)));
  };

  const activeInsights = insights.filter((i) => !i.dismissed);
  const dismissedInsights = insights.filter((i) => i.dismissed);

  const criticalCount = activeInsights.filter((i) => i.severity === "critical").length;
  const warningCount = activeInsights.filter((i) => i.severity === "warning").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Lightbulb size={28} className="text-primary" />
          {t("insights", language)}
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered predictive warnings before they become urgent
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <Eye size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeInsights.length}</p>
              <p className="text-xs text-muted-foreground">Active Insights</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-500">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold">{warningCount}</p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-orange-500" />
          Heads Up
        </h2>
        <div className="space-y-4">
          <AnimatePresence>
            {activeInsights.map((insight) => {
              const Icon = insightIcons[insight.type] || Lightbulb;
              return (
                <motion.div
                  key={insight.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                >
                  <Card className={insightColors[insight.severity] || ""}>
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          insight.severity === "critical"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                            : insight.severity === "warning"
                            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-500"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-500"
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{insight.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {insight.description}
                            </p>
                          </div>
                          <Badge className={insightBadgeColors[insight.severity]}>
                            {insight.severity}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismissInsight(insight.id)}
                          >
                            <X size={14} className="mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {activeInsights.length === 0 && (
            <Card>
              <div className="text-center py-8 text-muted-foreground">
                <Lightbulb size={32} className="mx-auto mb-3 opacity-50" />
                <p>No active insights</p>
                <p className="text-sm mt-1">Everything looks good! We&apos;ll alert you if anything changes.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {dismissedInsights.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Dismissed</h2>
          <div className="space-y-3 opacity-60">
            {dismissedInsights.map((insight) => (
              <Card key={insight.id}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Lightbulb size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="text-xs text-muted-foreground">{insight.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
