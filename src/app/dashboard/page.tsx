"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Link as LinkIcon,
  FileText,
  Search,
  Sparkles,
  Plus,
  Star,
  ExternalLink,
  Trash2,
  Tag as TagIcon,
  MessageSquare,
  Globe,
  Loader2,
  X,
  Bookmark,
  CheckCircle2,
} from "lucide-react";

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string | null;
  aiMemory: string | null;
  type: "link" | "note" | "document" | "audio";
  sourceUrl: string | null;
  favicon: string | null;
  category: string;
  tags: string[] | null;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
}

export default function DashboardPage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputUrlOrNote, setInputUrlOrNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchKnowledgeItems = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeItems();
  }, [fetchKnowledgeItems]);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrlOrNote.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputUrlOrNote.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) => [data.item, ...prev]);
        setInputUrlOrNote("");
        setNotification(`Memory extracted & saved: "${data.item.title}"`);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (err) {
      console.error("Failed to save knowledge item:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFavorite = async (id: string, currentFav: boolean) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, favorite: !currentFav } : it))
    );
    try {
      await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, favorite: !currentFav }),
      });
    } catch (err) {
      console.error("Failed to update favorite status:", err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await fetch("/api/knowledge", {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleAskBrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim()) return;

    setAskLoading(true);
    setAskResponse(null);
    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: askQuestion.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setAskResponse(data.reply);
      }
    } catch (err) {
      console.error("Ask Brain error:", err);
      setAskResponse("Sorry, failed to query your knowledge vault.");
    } finally {
      setAskLoading(false);
    }
  };

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    items.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((t) => tagSet.add(t.toLowerCase()));
      }
    });
    return Array.from(tagSet);
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedType === "favorites" && !item.favorite) return false;
      if (selectedType === "links" && item.type !== "link") return false;
      if (selectedType === "notes" && item.type !== "note") return false;

      if (selectedTag) {
        const tags = (Array.isArray(item.tags) ? item.tags : []) as string[];
        if (!tags.includes(selectedTag)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(q);
        const memoryMatch = (item.aiMemory || "").toLowerCase().includes(q);
        const summaryMatch = (item.summary || "").toLowerCase().includes(q);
        const categoryMatch = item.category.toLowerCase().includes(q);
        return titleMatch || memoryMatch || summaryMatch || categoryMatch;
      }

      return true;
    });
  }, [items, selectedType, selectedTag, searchQuery]);

  return (
    <div className="min-h-screen p-6 md:p-8 space-y-8 bg-background">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500 text-white shadow-xl font-medium text-sm"
          >
            <CheckCircle2 size={18} />
            <span>{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-blue-900/30 border border-primary/20 backdrop-blur-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Brain size={18} className="animate-pulse" />
            <span>Notion-Style Knowledge Engine</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI Second Brain</h1>
          <p className="text-muted-foreground text-sm max-w-xl">
            Paste any web link or note. AI automatically extracts the core memory, generates tags, and indexes it for instant natural search.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl gradient-bg text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all hover:scale-105"
          >
            <Sparkles size={18} />
            <span>Ask Your Brain AI</span>
          </button>
        </div>
      </div>

      {/* Quick Add Bar (Notion Style) */}
      <form
        onSubmit={handleSaveItem}
        className="flex flex-col sm:flex-row items-center gap-3 p-2 rounded-2xl bg-card border border-border/60 shadow-lg"
      >
        <div className="flex-1 flex items-center gap-3 px-4 py-2 w-full">
          <Globe className="text-primary shrink-0" size={20} />
          <input
            type="text"
            value={inputUrlOrNote}
            onChange={(e) => setInputUrlOrNote(e.target.value)}
            placeholder="Paste a web link (e.g. https://ui.shadcn.com) or type a note..."
            className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm font-medium"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !inputUrlOrNote.trim()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 shrink-0"
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              <span>Extracting Memory...</span>
            </>
          ) : (
            <>
              <Plus size={18} />
              <span>Save & Extract Memory</span>
            </>
          )}
        </button>
      </form>

      {/* Search & Filter Controls */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search website components, notes..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/40 text-xs font-medium w-full md:w-auto overflow-x-auto">
            {["all", "links", "notes", "favorites"].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedType(tab)}
                className={`px-4 py-2 rounded-lg capitalize transition-all ${
                  selectedType === tab
                    ? "bg-card text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Pills */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground flex items-center gap-1 font-medium">
              <TagIcon size={12} /> Tags:
            </span>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1 font-medium"
              >
                Clear filter <X size={12} />
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2.5 py-1 rounded-full border transition-all ${
                  selectedTag === tag
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Knowledge Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="animate-spin text-primary" size={32} />
          <p className="text-sm font-medium">Loading your AI Second Brain...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border/80 rounded-3xl p-8 bg-card/40">
          <Bookmark className="mx-auto text-muted-foreground/40 mb-3" size={48} />
          <h3 className="text-lg font-semibold mb-1">No Knowledge Memories Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {searchQuery || selectedTag
              ? "No items match your search filter. Try clearing filters or searching for something else."
              : "Paste your first web link (e.g., https://ui.shadcn.com) or type a note above to start building your Second Brain!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const tags = (Array.isArray(item.tags) ? item.tags : []) as string[];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative flex flex-col justify-between p-5 rounded-3xl bg-card border border-border/70 hover:border-primary/50 transition-all hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="space-y-3">
                  {/* Top Bar: Icon, Category & Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {item.favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.favicon}
                          alt=""
                          className="w-5 h-5 rounded-md object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : item.type === "link" ? (
                        <LinkIcon className="text-primary" size={16} />
                      ) : (
                        <FileText className="text-purple-400" size={16} />
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-md bg-muted/60">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleFavorite(item.id, item.favorite)}
                        className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${
                          item.favorite ? "text-amber-400" : "text-muted-foreground/50 hover:text-amber-400"
                        }`}
                      >
                        <Star size={16} fill={item.favorite ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-base leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>

                  {/* AI Memory Badge */}
                  {item.aiMemory && (
                    <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium flex items-start gap-2">
                      <Sparkles size={14} className="shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{item.aiMemory}</p>
                    </div>
                  )}

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* Bottom Bar: Tags & External Link */}
                <div className="pt-4 mt-4 border-t border-border/40 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1 flex-wrap overflow-hidden max-h-6">
                    {tags.slice(0, 3).map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                        #{t}
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="text-muted-foreground font-medium">+{tags.length - 3}</span>
                    )}
                  </div>

                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                    >
                      <span>Open</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* "Ask Your Brain" Slide-Over / Drawer Panel */}
      <AnimatePresence>
        {askOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAskOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-card border-l border-border z-50 shadow-2xl flex flex-col p-6 space-y-6"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center text-white">
                    <Brain size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">Ask Your AI Brain</h2>
                    <p className="text-xs text-muted-foreground">Search all saved links & memories</p>
                  </div>
                </div>
                <button
                  onClick={() => setAskOpen(false)}
                  className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Chat Input */}
              <form onSubmit={handleAskBrain} className="space-y-3">
                <div className="relative">
                  <textarea
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    placeholder="Ask anything, e.g.: 'Show website components' or 'What React UI tools do I have?'"
                    rows={3}
                    className="w-full p-3.5 rounded-2xl bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={askLoading || !askQuestion.trim()}
                  className="w-full py-3 rounded-xl gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {askLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      <span>Searching Memories...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Search Second Brain</span>
                    </>
                  )}
                </button>
              </form>

              {/* Answer Response Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {askResponse ? (
                  <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 text-sm space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-primary text-xs">
                      <MessageSquare size={14} />
                      <span>AI Memory Answer:</span>
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground text-xs md:text-sm">
                      {askResponse}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground space-y-2">
                    <Brain className="mx-auto text-primary/40" size={40} />
                    <p className="text-xs max-w-xs mx-auto">
                      Ask natural language questions across all your saved links, notes, and scraped web resources.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
