"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Sparkles, Send, User, Loader2, Wrench, CheckCircle2, XCircle, Link2 } from "lucide-react";
import { CitationPanel } from "@/components/CitationPanel";
import type { Citation } from "@/lib/citations";

interface ToolTrace {
  name: string;
  status: "running" | "ok" | "error";
  message?: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  tools?: ToolTrace[];
  sources?: string[];
  citations?: Citation[];
  status?: string;
}

const sampleQuestions = [
  "What's on my plate today?",
  "Remind me to call the landlord tomorrow at 10am",
  "Spent ₹450 on lunch at Subway",
  "What did I save about React UI libraries?",
  "Run my morning",
];

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "I'm your LifeFlow OS assistant. I can search your vault and the web, create tasks and reminders, log expenses, process meeting notes, and run your morning. Tell me what you need.",
      timestamp: now(),
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function patchMessage(id: string, updater: (message: ChatMessage) => ChatMessage) {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  }

  async function handleSend(textToSend?: string) {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = { id: `${Date.now()}-u`, sender: "user", text: query, timestamp: now() };
    const aiId = `${Date.now()}-a`;
    const aiMsg: ChatMessage = { id: aiId, sender: "ai", text: "", timestamp: now(), tools: [], status: "Thinking…" };

    const history = messages
      .filter((message) => message.id !== "welcome" && message.text)
      .slice(-10)
      .map((message) => ({ role: message.sender === "user" ? "user" : "assistant", content: message.text }));

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, history }),
      });
      if (!res.ok || !res.body) {
        patchMessage(aiId, (message) => ({ ...message, text: "Sorry, the assistant is unavailable right now.", status: undefined }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          switch (event.type) {
            case "status":
              patchMessage(aiId, (message) => ({ ...message, status: String(event.message) }));
              break;
            case "tool_start":
              patchMessage(aiId, (message) => ({
                ...message,
                status: `Running ${event.name}…`,
                tools: [...(message.tools || []), { name: String(event.name), status: "running" }],
              }));
              break;
            case "tool_result":
              patchMessage(aiId, (message) => ({
                ...message,
                tools: (message.tools || []).map((tool, index, all) =>
                  index === all.length - 1 && tool.name === event.name && tool.status === "running"
                    ? { ...tool, status: event.success ? "ok" : "error", message: String(event.message || "") }
                    : tool
                ),
              }));
              break;
            case "token":
              patchMessage(aiId, (message) => ({ ...message, text: message.text + String(event.text), status: undefined }));
              break;
            case "sources":
              patchMessage(aiId, (message) => ({ ...message, sources: event.sources as string[] }));
              break;
            case "citations":
              patchMessage(aiId, (message) => ({ ...message, citations: event.citations as Citation[] }));
              break;
            case "error":
              patchMessage(aiId, (message) => ({ ...message, text: message.text || String(event.message), status: undefined }));
              break;
            case "done":
              patchMessage(aiId, (message) => ({ ...message, status: undefined, text: message.text || String(event.reply || "") }));
              break;
          }
        }
      }
    } catch {
      patchMessage(aiId, (message) => ({ ...message, text: "Sorry, something went wrong.", status: undefined }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-6 md:p-8 flex flex-col max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border">
        <div className="w-10 h-10 rounded-2xl gradient-bg flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <Brain size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">LifeFlow OS Assistant</h1>
          <p className="text-xs text-muted-foreground">Acts with tools: vault + web search, tasks, reminders, expenses, meetings, Morning OS</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground font-medium flex items-center gap-1">
          <Sparkles size={12} className="text-primary" /> Try:
        </span>
        {sampleQuestions.map((q) => (
          <button
            key={q}
            onClick={() => handleSend(q)}
            disabled={loading}
            className="px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/20 hover:text-primary border border-border/60 transition-all font-medium disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

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
              className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed space-y-2 ${
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                  : "bg-muted/50 border border-border/60 text-foreground rounded-tl-none"
              }`}
            >
              {msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.tools.map((tool, index) => (
                    <span
                      key={`${tool.name}-${index}`}
                      title={tool.message}
                      className="inline-flex items-center gap-1 rounded-full bg-background/70 border border-border px-2 py-0.5 text-[11px] font-mono"
                    >
                      {tool.status === "running" ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : tool.status === "ok" ? (
                        <CheckCircle2 size={11} className="text-emerald-500" />
                      ) : (
                        <XCircle size={11} className="text-destructive" />
                      )}
                      <Wrench size={10} /> {tool.name}
                    </span>
                  ))}
                </div>
              )}
              {msg.status && !msg.text && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> {msg.status}
                </div>
              )}
              {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
              {(!msg.citations || msg.citations.length === 0) && msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.sources.map((source) => (
                    <a
                      key={source}
                      href={source}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[220px]"
                    >
                      <Link2 size={10} /> {source.replace(/^https?:\/\//, "")}
                    </a>
                  ))}
                </div>
              )}
              {msg.citations && <CitationPanel citations={msg.citations} />}
              <div className={`text-[10px] font-mono ${msg.sender === "user" ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>
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
        <div ref={endRef} />
      </div>

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
          placeholder="Ask, or tell me what to do — “remind me…”, “spent 300 on…”, “what did I save about…”"
          className="flex-1 px-4 py-2.5 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground font-medium"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl gradient-bg text-white hover:opacity-90 transition-all disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
