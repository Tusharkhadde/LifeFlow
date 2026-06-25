"use client";

import { useState, useRef, useEffect } from "react";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage } from "@/lib/types";
import {
  Bot,
  Send,
  Mic,
  MicOff,
  Volume2,
  User,
  Loader2,
} from "lucide-react";

function generateAIResponse(
  query: string,
  data: {
    tasks: ReturnType<typeof useData>["tasks"];
    expenses: ReturnType<typeof useData>["expenses"];
    goals: ReturnType<typeof useData>["goals"];
    reminders: ReturnType<typeof useData>["reminders"];
    insights: ReturnType<typeof useData>["insights"];
  }
): string {
  const lower = query.toLowerCase();

  if (lower.includes("what should i do today") || lower.includes("today's task") || lower.includes("today")) {
    const todayTasks = data.tasks.filter((t) => !t.completed).slice(0, 5);
    if (todayTasks.length === 0) return "You have no pending tasks for today. Great job staying on top of things!";
    const taskList = todayTasks.map((t, i) => `${i + 1}. ${t.title}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ""}`).join("\n");
    return `Here's your priority list for today:\n\n${taskList}\n\nFocus on the most urgent items first. Would you like me to help with any of these?`;
  }

  if (lower.includes("bill") || lower.includes("due this week")) {
    const bills = data.tasks.filter((t) => t.category === "bill" && !t.completed);
    if (bills.length === 0) return "No bills due currently. You're all clear!";
    const billList = bills.map((b) => `- ${b.title}: due ${b.dueDate ? new Date(b.dueDate).toLocaleDateString() : "unknown"}`).join("\n");
    return `Here are your pending bills:\n\n${billList}\n\nWould you like me to set up payment reminders?`;
  }

  if (lower.includes("spend") || lower.includes("expense") || lower.includes("money")) {
    const total = data.expenses.reduce((s, e) => s + e.amount, 0);
    const byCat = data.expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    return `Your total tracked expenses are ₹${total.toLocaleString()}. Your highest spending category is ${topCat?.[0] || "none"} at ₹${topCat?.[1]?.toLocaleString() || 0}. Would you like tips to reduce spending?`;
  }

  if (lower.includes("goal") || lower.includes("progress")) {
    const goals = data.goals.filter((g) => !g.completed);
    if (goals.length === 0) return "You don't have any active goals. Would you like to set one up?";
    const goalList = goals.map((g) => {
      const pct = g.target ? Math.round((g.current / g.target) * 100) : 0;
      return `- ${g.title}: ${pct}% complete`;
    }).join("\n");
    return `Here's your goal progress:\n\n${goalList}\n\nKeep up the momentum! Want suggestions to accelerate your progress?`;
  }

  if (lower.includes("deadline") || lower.includes("missing")) {
    const overdue = data.tasks.filter((t) => {
      if (!t.dueDate || t.completed) return false;
      return new Date(t.dueDate) < new Date();
    });
    if (overdue.length === 0) return "No overdue items! You're doing great at staying on top of deadlines.";
    const overdueList = overdue.map((t) => `- ${t.title} (was due ${new Date(t.dueDate!).toLocaleDateString()})`).join("\n");
    return `You have ${overdue.length} overdue item(s):\n\n${overdueList}\n\nI recommend addressing these immediately.`;
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm your LifeFlow AI assistant. I can help you with:\n\n- Your daily task priorities\n- Bill and payment tracking\n- Expense summaries\n- Goal progress updates\n- Deadline alerts\n\nWhat would you like to know?";
  }

  if (lower.includes("help")) {
    return "I can help you with:\n\n• \"What should I do today?\" — Priority task list\n• \"What bills are due?\" — Payment overview\n• \"What am I spending on?\" — Expense summary\n• \"How are my goals?\" — Progress update\n• \"What deadlines am I missing?\" — Overdue alerts\n\nJust ask naturally!";
  }

  return `I understand you're asking about "${query}". Based on your LifeFlow data, you have ${data.tasks.filter((t) => !t.completed).length} pending tasks, ${data.reminders.filter((r) => !r.completed).length} reminders, and ${data.goals.filter((g) => !g.completed).length} active goals. Would you like more details on any of these?`;
}

export default function AssistantPage() {
  const { tasks, expenses, goals, reminders, insights } = useData();
  const { language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: `Hello! I'm your LifeFlow AI assistant. Ask me anything about your tasks, expenses, goals, or reminders. You can also use voice input!`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

    const response = generateAIResponse(input, { tasks, expenses, goals, reminders, insights });
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Voice input is not supported in your browser. Try Chrome!");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionConstructor = (window as unknown as { SpeechRecognition: new () => SpeechRecognition }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognition }).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-US";
    utterance.rate = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Bot size={28} className="text-primary" />
          {t("assistant", language)}
        </h1>
        <p className="text-muted-foreground mt-1">
          Ask anything about your life data — text or voice
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pb-4">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex items-start gap-3 max-w-[80%] ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-primary/20"
                      : "gradient-bg"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User size={14} className="text-primary" />
                  ) : (
                    <Bot size={14} className="text-white" />
                  )}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "gradient-bg text-white rounded-tr-sm"
                      : "glass-card rounded-tl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && (
                    <button
                      onClick={() => speak(msg.content)}
                      className="mt-2 text-xs opacity-60 hover:opacity-100 flex items-center gap-1"
                    >
                      <Volume2 size={12} />
                      {isSpeaking ? "Playing..." : "Listen"}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div className="glass-card rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="glass-card rounded-2xl p-3 mt-auto">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder={t("typeNaturalLanguage", language)}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none border-0 focus-visible:ring-0 bg-transparent"
            rows={1}
          />
          <Button
            size="icon"
            variant={isListening ? "destructive" : "ghost"}
            onClick={toggleVoice}
            className="flex-shrink-0"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="flex-shrink-0"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
