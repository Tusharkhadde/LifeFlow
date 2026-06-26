"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { useSession, signOut } from "@/lib/auth-client";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Target,
  Bell,
  Bot,
  Lightbulb,
  Settings,
  Menu,
  X,
  Zap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "documents", href: "/documents", icon: FileText },
  { key: "expenses", href: "/expenses", icon: Receipt },
  { key: "goals", href: "/goals", icon: Target },
  { key: "reminders", href: "/reminders", icon: Bell },
  { key: "assistant", href: "/assistant", icon: Bot },
  { key: "insights", href: "/insights", icon: Lightbulb },
  { key: "settings", href: "/settings", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "lifeflow-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  // Load collapsed state from localStorage
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
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 glass-card p-2 rounded-xl"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile backdrop */}
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
        {/* Header */}
        <div className={cn("mb-8", collapsed ? "px-3 flex justify-center" : "px-3")}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0">
              <Zap className="text-white" size={18} />
            </div>
            {!collapsed && (
              <span className="text-xl font-bold gradient-text whitespace-nowrap">LifeFlow AI</span>
            )}
          </div>
          {!collapsed && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("tagline", language)}
            </p>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex items-center justify-center mx-3 mb-4 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? t(item.key, language) : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  isActive
                    ? "gradient-bg text-white shadow-lg"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {!collapsed && <span>{t(item.key, language)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className={cn("mt-auto", collapsed ? "px-2" : "px-3")}>
          <div className={cn("glass-card rounded-xl", collapsed ? "p-2" : "p-3")}>
            <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              {user?.image ? (
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
