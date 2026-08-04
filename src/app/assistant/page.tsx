"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Sparkles,
  Send,
  User,
  Loader2,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}

const sampleQuestions = [
  "website components",
  "What React UI libraries do I have saved?",
  "Show me web links for website building",
  "What notes did I save recently?",
];

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "Hello! I am your AI Second Brain Assistant. Ask me anything about your saved web links, notes, or scraped web resources (e.g., 'website components').",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: data.reply || "No matching knowledge items found.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      console.error("Ask AI Assistant error:", err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: "Sorry, I ran into an error searching your Second Brain memory. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-8 flex flex-col max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border">
        <div className="w-10 h-10 rounded-2xl gradient-bg flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <Brain size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Ask AI Second Brain</h1>
          <p className="text-xs text-muted-foreground">Search and query all saved web links, notes, and scraped resources</p>
        </div>
      </div>

      {/* Suggested Query Chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground font-medium flex items-center gap-1">
          <Sparkles size={12} className="text-primary" /> Suggested searches:
        </span>
        {sampleQuestions.map((q) => (
          <button
            key={q}
            onClick={() => handleSend(q)}
            className="px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/20 hover:text-primary border border-border/60 transition-all font-medium"
          >
            &quot;{q}&quot;
          </button>
        ))}
      </div>

      {/* Messages Area */}
      <div className="flex-1 min-h-[450px] p-6 rounded-3xl bg-card border border-border shadow-inner overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "ai" && (
              <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center text-white shrink-0 mt-1">
                <Brain size={16} />
              </div>
            )}

            <div
              className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                  : "bg-muted/50 border border-border/60 text-foreground rounded-tl-none"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              <div
                className={`text-[10px] mt-2 font-mono ${
                  msg.sender === "user" ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>

            {msg.sender === "user" && (
              <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-foreground shrink-0 mt-1">
                <User size={16} />
              </div>
            )}
          </motion.div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start items-center text-muted-foreground text-xs font-medium">
            <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center text-white shrink-0">
              <Loader2 className="animate-spin" size={16} />
            </div>
            <p>Searching your Second Brain memories...</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-3 p-2 rounded-2xl bg-card border border-border shadow-lg"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your AI Brain (e.g. 'website components' or 'React UI tools')..."
          className="flex-1 px-4 py-2.5 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground font-medium"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl gradient-bg text-white hover:opacity-90 transition-all disabled:opacity-50 shrink-0"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
