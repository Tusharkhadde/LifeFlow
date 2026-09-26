"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "@/lib/auth-client";
import {
  Brain,
  Sparkles,
  Settings,
  Menu,
  X,
  Zap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  CheckSquare,
  Bell,
  TrendingUp,
  IndianRupee,
  Flame,
  Network,
  History,
  Target,
  Users,
  Webhook,
  Gauge,
  Plug,
  LayoutDashboard,
  FolderKanban,
  Activity,
  KeyRound,
  NotebookPen,
  Inbox,
  BriefcaseBusiness,
  ShieldCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { NotificationBell } from "@/components/NotificationBell";

const navSections = [
  {
    label: "Home",
    items: [
      { key: "today", label: "Today", href: "/dashboard/today", icon: LayoutDashboard },
      { key: "inbox", label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
      { key: "dashboard", label: "Knowledge Vault", href: "/dashboard", icon: Brain },
      { key: "assistant", label: "Ask AI Brain", href: "/assistant", icon: Sparkles },
    ],
  },
  {
    label: "Life",
    items: [
      { key: "meetings", label: "Meetings", href: "/dashboard/meetings", icon: NotebookPen },
      { key: "projects", label: "Projects", href: "/dashboard/projects", icon: BriefcaseBusiness },
      { key: "tasks", label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
      { key: "reminders", label: "Reminders", href: "/dashboard/reminders", icon: Bell },
      { key: "expenses", label: "Expenses", href: "/dashboard/expenses", icon: IndianRupee },
      { key: "budgets", label: "Budgets & Goals", href: "/dashboard/budgets", icon: Target },
      { key: "habits", label: "Habits", href: "/dashboard/habits", icon: Flame },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "insights", label: "Insights", href: "/dashboard/insights", icon: TrendingUp },
      { key: "graph", label: "Graph", href: "/dashboard/graph", icon: Network },
      { key: "collections", label: "Collections", href: "/dashboard/collections", icon: FolderKanban },
      { key: "memory", label: "Memory", href: "/dashboard/memory", icon: Brain },
      { key: "search-history", label: "Search History", href: "/dashboard/search-history", icon: History },
      { key: "activity", label: "Activity", href: "/dashboard/activity", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { key: "integrations", label: "Integrations", href: "/dashboard/integrations", icon: Plug },
      { key: "automation", label: "Automation", href: "/dashboard/automation", icon: Webhook },
      { key: "developer", label: "Developer", href: "/dashboard/developer", icon: KeyRound },
      { key: "workspace", label: "Team", href: "/dashboard/workspace", icon: Users },
      { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FileText },
      { key: "usage", label: "Usage", href: "/dashboard/usage", icon: Gauge },
      { key: "settings", label: "Settings", href: "/settings", icon: Settings },
      { key: "privacy", label: "Privacy", href: "/settings/privacy", icon: ShieldCheck },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = "lifeflow-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved !== null) setCollapsed(saved === "true");
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: next } }));
  }

  const user = session?.user;
  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";
  const userName = user?.name || "User";
  const userEmail = user?.email || "";

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 glass-card p-2 rounded-xl"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-background/95 backdrop-blur-md border-r border-border z-50 flex flex-col py-6 transition-all duration-300",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <div className={cn("mb-6", collapsed ? "px-3 flex justify-center" : "px-3")}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0">
              <Zap className="text-white" size={18} />
            </div>
            {!collapsed && (
              <span className="text-xl font-bold gradient-text whitespace-nowrap">LifeFlow AI</span>
            )}
          </div>
          {!collapsed && (
            <p className="text-xs text-muted-foreground mt-1">Personal OS · Second Brain</p>
          )}
        </div>

        <button
          onClick={toggleCollapse}
          className="hidden lg:flex items-center justify-center mx-3 mb-3 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <nav className="flex-1 space-y-4 px-2 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {section.label}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.key}
                      data-tour={`nav-${item.key}`}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200",
                        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                        isActive
                          ? "gradient-bg text-white shadow-lg"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon size={18} className="flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto", collapsed ? "px-2" : "px-3")}>
          <div className={cn("glass-card rounded-xl", collapsed ? "p-2" : "p-3")}>
            <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {userInitial}
                </div>
              )}
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  </div>
                  <NotificationBell />
                  <button
                    onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Sign out"
                  >
                    <LogOut size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
