"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { PremiumHero } from "@/components/ui/hero";
import { GlowBorderCard } from "@/components/ui/glow-border-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  FileText,
  Bell,
  LayoutDashboard,
  Receipt,
  Target,
  Zap,
  MessageCircle,
  Smartphone,
  CheckCircle2,
  TrendingUp,
  Shield,
  Sparkles,
  Brain,
  Bot,
  Star,
  Quote,
  Menu,
  X,
} from "lucide-react";

const features = [
  {
    icon: LayoutDashboard,
    title: "AI Dashboard",
    desc: "Smart daily priorities ranked by urgency and impact. Your day, optimized.",
    gradient: "from-emerald-500/20 to-emerald-500/5",
    border: "emerald" as const,
  },
  {
    icon: FileText,
    title: "Document OCR",
    desc: "Upload or snap a photo. Dates, amounts, expiry — extracted instantly.",
    gradient: "from-blue-500/20 to-blue-500/5",
    border: "ocean" as const,
  },
  {
    icon: Receipt,
    title: "Expense Tracking",
    desc: "Log spending naturally. AI categorizes and surfaces savings automatically.",
    gradient: "from-amber-500/20 to-amber-500/5",
    border: "sunset" as const,
  },
  {
    icon: Target,
    title: "Goal Coach",
    desc: "Set savings or habit goals. AI tracks progress and keeps you accountable.",
    gradient: "from-violet-500/20 to-violet-500/5",
    border: "aurora" as const,
  },
  {
    icon: Bell,
    title: "Smart Reminders",
    desc: "Natural language scheduling. Pay bills before they're due, effortlessly.",
    gradient: "from-rose-500/20 to-rose-500/5",
    border: "sunset" as const,
  },
  {
    icon: TrendingUp,
    title: "Predictions",
    desc: "Risks surfaced before they become urgent. Stay ahead, not behind.",
    gradient: "from-cyan-500/20 to-cyan-500/5",
    border: "ocean" as const,
  },
  {
    icon: Shield,
    title: "Your Data",
    desc: "Encrypted, private, and under your control. No sharing, no ads. Ever.",
    gradient: "from-emerald-500/20 to-emerald-500/5",
    border: "emerald" as const,
  },
  {
    icon: Bot,
    title: "AI Assistant",
    desc: "Chat naturally. Your AI handles tasks, answers questions, and anticipates needs.",
    gradient: "from-purple-500/20 to-purple-500/5",
    border: "aurora" as const,
  },
];

const steps = [
  { number: "01", title: "Connect", desc: "Link Telegram or log in. Takes 10 seconds." },
  { number: "02", title: "Chat Naturally", desc: "Say \"spent ₹500 on lunch\" or \"remind me about bill\"" },
  { number: "03", title: "Let AI Work", desc: "LifeFlow OCRs, categorizes, schedules, and reminds." },
  { number: "04", title: "Stay Ahead", desc: "Wake up to an AI-sorted dashboard. No manual entry." },
];

const testimonials = [
  {
    name: "Ananya Sharma",
    role: "Freelance Designer",
    avatar: "AS",
    quote: "I used to juggle 5 apps for life admin. LifeFlow replaced all of them. The Telegram bot is a game changer.",
  },
  {
    name: "Rahul Mehta",
    role: "Software Engineer",
    avatar: "RM",
    quote: "The document OCR saves me hours every week. I just snap a photo and everything's organized.",
  },
  {
    name: "Priya Patel",
    role: "Small Business Owner",
    avatar: "PP",
    quote: "Expense tracking that actually works. It catches things I'd miss and the predictions keep me on top of bills.",
  },
];

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatItem({ value, label, suffix = "+" }: { value: number; label: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [counted, setCounted] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const duration = 2000;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounted(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isInView, value]);

  return (
    <div ref={ref} className="text-center group">
      <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tabular-nums">
        {counted}<span className="text-emerald-500">{suffix}</span>
      </div>
      <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 group-hover:text-zinc-300 transition-colors">{label}</p>
    </div>
  );
}

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black selection:bg-emerald-500/30">
      {/* Fixed Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/[0.06]" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                <Zap size={16} />
              </div>
              <span className="font-semibold text-white text-lg tracking-tight">LifeFlow</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              <Link href="/login" className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]">
                Sign In
              </Link>
              <Link href="/dashboard">
                <Button size="sm" className="ml-2 shadow-lg shadow-emerald-500/20">
                  Get Started <ArrowRight size="14" className="ml-1.5" />
                </Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-zinc-400 hover:text-white"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden pb-4 border-t border-white/[0.06] pt-4 space-y-2"
            >
              <Link href="/login" className="block px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06]" onClick={() => setMobileMenuOpen(false)}>
                Sign In
              </Link>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full">
                  Get Started <ArrowRight size="14" className="ml-1.5" />
                </Button>
              </Link>
            </motion.div>
          )}
        </div>
      </motion.nav>

      {/* Hero */}
      <PremiumHero />

      {/* Stats */}
      <section className="relative py-16 sm:py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-emerald-950/10 to-black pointer-events-none" />
        <div className="max-w-4xl mx-auto relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatItem value={12500} label="Active Users" />
            <StatItem value={89000} label="Tasks Done" />
            <StatItem value={45000} label="Documents Analyzed" />
            <StatItem value={250000} label="Saved (&#8377;)" suffix="+" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-28 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/5 via-black to-black pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-14 sm:mb-18">
              <Badge variant="outline" className="mb-5 border-emerald-500/20 text-emerald-400 bg-emerald-500/5 px-4 py-1.5">
                <Sparkles size="12" className="mr-2" />
                Powerful Features
              </Badge>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                Everything in{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">one place</span>
              </h2>
              <p className="text-zinc-500 mt-4 max-w-lg mx-auto text-base leading-relaxed">
                No more app-hopping. LifeFlow connects your life admin into a single AI-powered feed.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <AnimatedSection key={i}>
                  <GlowBorderCard
                    colorPreset={f.border}
                    animationDuration={6}
                    borderRadius="1rem"
                    aspectRatio="unset"
                    className="group hover:scale-[1.02] transition-transform duration-300 cursor-default !bg-black/40 !border-white/[0.06]"
                  >
                    <div className="p-1">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 ring-1 ring-white/[0.06]`}>
                        <Icon size="18" className="text-zinc-200" />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                      <p className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">{f.desc}</p>
                    </div>
                  </GlowBorderCard>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-28 px-4 border-t border-white/[0.06] relative">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-emerald-950/5 to-black pointer-events-none" />
        <div className="max-w-4xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-14">
              <Badge variant="outline" className="mb-5 border-emerald-500/20 text-emerald-400 bg-emerald-500/5 px-4 py-1.5">
                <Brain size="12" className="mr-2" />
                How It Works
              </Badge>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                Zero setup.{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">Instant value.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <AnimatedSection key={i}>
                <div className="relative group">
                  <div className="text-4xl sm:text-5xl font-bold text-white/[0.04] group-hover:text-emerald-500/10 transition-colors duration-500 mb-3 select-none">
                    {step.number}
                  </div>
                  <div className="w-8 h-0.5 bg-emerald-500/50 mb-4 group-hover:w-12 transition-all duration-300" />
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram Section */}
      <section className="py-20 sm:py-28 px-4 border-t border-white/[0.06] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-emerald-950/10 to-black pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <div>
                <Badge variant="outline" className="mb-5 border-emerald-500/20 text-emerald-400 bg-emerald-500/5 px-4 py-1.5">
                  <MessageCircle size="12" className="mr-2" />
                  Telegram Bot
                </Badge>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                  Best on{" "}
                  <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">Telegram</span>
                </h2>
                <p className="text-zinc-400 text-base leading-relaxed mb-8 max-w-md">
                  Link your account and manage everything from your phone.
                  Just chat naturally &mdash; no app required.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    "Add tasks by texting naturally",
                    "Track expenses on the go",
                    "Upload documents for instant analysis",
                    "Get smart reminders in real-time",
                    "Switch AI models with /model command",
                  ].map((b, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-3"
                    >
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5 shrink-0">
                        <CheckCircle2 size="13" className="text-emerald-400" />
                      </div>
                      <span className="text-sm text-zinc-300">{b}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/dashboard">
                    <Button size="lg" className="shadow-lg shadow-emerald-500/20">
                      <Smartphone size="15" className="mr-2" /> Link Telegram
                    </Button>
                  </Link>
                  <Link href="https://t.me/lifeflow_ai_bot" target="_blank">
                    <Button variant="outline" size="lg">
                      <MessageCircle size="15" className="mr-2" /> Open Bot
                    </Button>
                  </Link>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection>
              <div className="hidden lg:flex justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="w-[280px] h-[520px] rounded-[2rem] border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm p-3 flex flex-col shadow-2xl shadow-emerald-500/5 relative"
                >
                  <div className="absolute -inset-1 rounded-[2.2rem] bg-gradient-to-b from-emerald-500/20 to-transparent opacity-50 pointer-events-none" />
                  <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.06] relative">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <Zap size="12" className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white">LifeFlow AI</p>
                      <p className="text-[10px] text-zinc-500">Online</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
                  </div>
                  <div className="flex-1 flex flex-col justify-end gap-2 py-3">
                    {[
                      { side: "left", text: "Spent ₹500 on lunch today" },
                      { side: "right", text: "Done! Saved: ₹500 food expense" },
                      { side: "left", text: "Remind me to pay electricity bill by 5th" },
                      { side: "right", text: "Set reminder for Electricity Bill (Apr 5)" },
                      { side: "left", text: "[image] receipt.jpg" },
                      { side: "right", text: "Receipt analyzed: ₹1,200, Grocery" },
                    ].map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.15 }}
                        className={`max-w-[85%] ${msg.side === "left" ? "self-start" : "self-end"}`}
                      >
                        <div className={`rounded-xl px-3 py-2 ${
                          msg.side === "left"
                            ? "bg-zinc-800 rounded-bl-sm"
                            : "bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-br-sm"
                        }`}>
                          <p className={`text-[11px] leading-relaxed ${
                            msg.side === "left" ? "text-zinc-300" : "text-white"
                          }`}>{msg.text}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-white/[0.06] relative">
                    <div className="flex items-center gap-2 bg-zinc-800/50 rounded-xl px-3 py-2">
                      <span className="text-[11px] text-zinc-500 flex-1">Type a message...</span>
                      <Zap size="12" className="text-emerald-500" />
                    </div>
                  </div>
                </motion.div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28 px-4 border-t border-white/[0.06] relative">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-emerald-950/5 to-black pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-14">
              <Badge variant="outline" className="mb-5 border-emerald-500/20 text-emerald-400 bg-emerald-500/5 px-4 py-1.5">
                <Star size="12" className="mr-2" />
                Loved by Users
              </Badge>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                What people{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">are saying</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <AnimatedSection key={i}>
                <div className="relative p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
                  <Quote size="20" className="text-emerald-500/30 mb-4 group-hover:text-emerald-500/50 transition-colors" />
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xs font-semibold flex items-center justify-center">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      <p className="text-xs text-zinc-500">{t.role}</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 sm:py-32 px-4 border-t border-white/[0.06] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/10 via-black to-black pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
        <AnimatedSection>
          <div className="max-w-2xl mx-auto text-center relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
              <Sparkles size="28" className="text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
              Zero manual data entry
            </h2>
            <p className="text-base text-zinc-400 mb-8 max-w-lg mx-auto leading-relaxed">
              Upload a document, send a photo on Telegram, or just type naturally.
              LifeFlow AI extracts data, updates everything, and reminds you automatically.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/dashboard">
                <Button size="xl" className="shadow-2xl shadow-emerald-500/25 gap-2">
                  Start Your LifeFlow <ArrowRight size="18" />
                </Button>
              </Link>
              <Link href="https://t.me/lifeflow_ai_bot" target="_blank">
                <Button variant="outline" size="xl">
                  <MessageCircle size="16" className="mr-2" /> Try on Telegram
                </Button>
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/[0.06] relative">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <Zap size="12" className="text-white" />
                </div>
                <span className="font-semibold text-sm text-white">LifeFlow</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed max-w-xs">
                Your personal AI-powered life operating system. Tasks, expenses, documents, and reminders — all in one place.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2.5">
                {["Dashboard", "Expenses", "Goals", "Reminders", "Insights"].map((item) => (
                  <li key={item}>
                    <Link href={`/${item.toLowerCase()}`} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Connect</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="https://t.me/lifeflow_ai_bot" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                    Telegram Bot
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                    Create Account
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-white/[0.06] text-center">
            <p className="text-xs text-zinc-700">
              LifeFlow AI &mdash; Personal life operating system.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
