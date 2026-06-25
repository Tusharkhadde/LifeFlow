"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useLanguage } from "@/components/LanguageProvider";
import { AuroraHero } from "@/components/ui/aurora-hero";
import { MorphText } from "@/components/ui/morph-text";
import AnimatedButton from "@/components/ui/animated-button";
import { GlowBorderCard } from "@/components/ui/glow-border-card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Target,
  Bell,
  Bot,
  Lightbulb,
  Sun,
  Moon,
  ArrowRight,
  Zap,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";

const features = [
  { icon: LayoutDashboard, title: "AI Dashboard", desc: "Smart daily priorities with reasoning" },
  { icon: FileText, title: "Document OCR", desc: "Extract and organize any document" },
  { icon: Receipt, title: "Expense AI", desc: "Track, categorize and find savings" },
  { icon: Target, title: "Goal Coach", desc: "AI-powered progress tracking" },
  { icon: Bell, title: "Smart Reminders", desc: "Natural language scheduling" },
  { icon: Bot, title: "Voice Assistant", desc: "Ask anything, get instant answers" },
  { icon: Lightbulb, title: "Predictions", desc: "Risks surfaced before they are urgent" },
  { icon: Shield, title: "Secure", desc: "Your data, your control" },
];

export default function HomePage() {
  const { theme, setTheme } = useTheme();
  useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
                <Zap className="text-white" size={18} />
              </div>
              <span className="text-lg font-bold gradient-text">LifeFlow AI</span>
            </div>
            <div className="flex items-center gap-3">
              {mounted && (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              )}
              <Link href="/dashboard">
                <AnimatedButton>
                  Get Started <ArrowRight size={16} className="ml-2" />
                </AnimatedButton>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section with Aurora Effect */}
      <section className="relative">
        <AuroraHero title="LifeFlow AI" />
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-4 tracking-widest uppercase">
              AI-Powered Life Management
            </p>
            <MorphText
              words={["ORGANIZE", "PREDICT", "AUTOMATE"]}
              fontSize="clamp(2rem, 8vw, 6rem)"
              interval={2500}
            />
            <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
              Stop managing fragmented life admin. LifeFlow AI proactively organizes, predicts,
              and recommends actions so you can focus on living.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link href="/dashboard">
                <AnimatedButton>
                  Launch Dashboard <ArrowRight size={18} className="ml-2" />
                </AnimatedButton>
              </Link>
              <Link href="/assistant">
                <AnimatedButton className="bg-background text-foreground border border-border">
                  <Bot size={18} className="mr-2" /> Try AI Assistant
                </AnimatedButton>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Active Users", value: 12500 },
              { label: "Tasks Completed", value: 89000 },
              { label: "Documents Scanned", value: 45000 },
              { label: "Money Saved", value: 250000 },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-primary flex justify-center">
                  <AnimatedNumber value={stat.value} />
                  <span className="text-primary">+</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need, <span className="gradient-text">one place</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From bills to goals, documents to deadlines - LifeFlow handles it all.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <GlowBorderCard
                key={i}
                colorPreset="emerald"
                aspectRatio="4/3"
                borderRadius="1rem"
                animationDuration={4 + i * 0.5}
              >
                <div className="flex flex-col items-center text-center p-4">
                  <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center mb-3">
                    <feature.icon className="text-white" size={22} />
                  </div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </GlowBorderCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <GlowBorderCard
            colorPreset="emerald"
            aspectRatio="auto"
            borderRadius="1.5rem"
            animationDuration={6}
          >
            <div className="text-center p-8 sm:p-12">
              <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6">
                <Zap className="text-white" size={28} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Zero Manual Data Entry</h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Upload a document or bill, and LifeFlow autonomously extracts data, updates trackers,
                detects patterns, and generates reminders completely hands-free.
              </p>
              <Link href="/dashboard">
                <AnimatedButton>
                  Start Your LifeFlow <ArrowRight size={18} className="ml-2" />
                </AnimatedButton>
              </Link>
            </div>
          </GlowBorderCard>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>LifeFlow AI - Built for the future of personal productivity.</p>
        </div>
      </footer>
    </div>
  );
}
