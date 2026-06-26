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
} from "lucide-react";
import { useState } from "react";

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

export function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

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
          "fixed left-0 top-0 h-full w-64 bg-background/95 backdrop-blur-md border-r border-border z-50 flex flex-col py-6 px-3 transition-transform duration-300",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="text-white" size={18} />
            </div>
            <span className="text-xl font-bold gradient-text">LifeFlow AI</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("tagline", language)}
          </p>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "gradient-bg text-white shadow-lg"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon size={18} />
                {t(item.key, language)}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 mt-auto">
          <div className="glass-card p-3 rounded-xl">
            <div className="flex items-center gap-3">
              {user?.image ? (
                <img
                  src={user.image}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold">
                  {userInitial}
                </div>
              )}
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
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
