"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "Your command center",
    description: "Today combines priorities, proactive alerts, habits, spending, reminders, and Morning OS.",
    href: "/dashboard/today",
  },
  {
    title: "Triage before AI acts",
    description: "Universal Inbox lets you approve, dismiss, snooze, and assign AI proposals to projects.",
    href: "/dashboard/inbox",
  },
  {
    title: "Build your second brain",
    description: "Save any note or URL. LifeFlow summarizes, embeds, cites, and auto-links it into your graph.",
    href: "/dashboard",
  },
  {
    title: "Organize around outcomes",
    description: "Projects connect tasks, meetings, knowledge, expenses, people, and activity in one hub.",
    href: "/dashboard/projects",
  },
  {
    title: "Ask an agent, not a chatbot",
    description: "The assistant can search, cite, create tasks and reminders, log spending, and run workflows.",
    href: "/assistant",
  },
];

export function ProductTour() {
  const router = useRouter();
  const [step, setStep] = useState(-1);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        if (data.settings && !data.settings.productTourCompletedAt) setStep(0);
      })
      .catch(() => {});
    const restart = () => setStep(0);
    window.addEventListener("lifeflow-tour", restart);
    return () => window.removeEventListener("lifeflow-tour", restart);
  }, []);

  if (step < 0) return null;
  const current = STEPS[step];

  async function finish() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productTourCompletedAt: new Date().toISOString() }),
    });
    setStep(-1);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      void finish();
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    router.push(STEPS[nextStep].href);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-3xl border border-primary/30 bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-bg text-white">
            <Sparkles size={19} />
          </div>
          <button onClick={finish} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Skip tour">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Step {step + 1} of {STEPS.length}
        </div>
        <h2 className="mt-2 text-2xl font-bold">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.description}</p>
        <div className="mt-6 flex items-center justify-between">
          <button onClick={finish} className="text-sm text-muted-foreground">Skip</button>
          <Button onClick={next}>
            {step === STEPS.length - 1 ? "Start using LifeFlow" : "Next"}
            <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
