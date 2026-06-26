"use client";

import { useTheme } from "next-themes";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { useSession, signOut } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Language } from "@/lib/types";
import {
  Sun,
  Moon,
  Globe,
  User,
  Bell,
  Shield,
  Palette,
  LogOut,
  Send,
  Link2,
  Unlink,
  Copy,
  Check,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();

  // Telegram state
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramAccounts, setTelegramAccounts] = useState<{ telegramId: bigint; name: string | null; linkedAt: Date }[]>([]);
  const [linkCode, setLinkCode] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => setMounted(true), []);

  // Fetch Telegram link status
  useEffect(() => {
    if (!mounted) return;
    fetch("/api/telegram/link")
      .then((r) => r.json())
      .then((data) => {
        setTelegramLinked(data.linked);
        setTelegramAccounts(data.accounts || []);
      })
      .catch(() => {});
  }, [mounted]);

  // Countdown timer for code expiry
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleGenerateLink() {
    setLinkLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (data.code) {
        setLinkCode(data.code);
        setCountdown(data.expiresIn || 300);
      }
    } catch {
      // silent
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleUnlink() {
    setUnlinkLoading(true);
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      setTelegramLinked(false);
      setTelegramAccounts([]);
      setLinkCode("");
    } catch {
      // silent
    } finally {
      setUnlinkLoading(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(linkCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const user = session?.user;

  const languages: { value: Language; label: string; nativeLabel: string }[] = [
    { value: "en", label: "English", nativeLabel: "English" },
    { value: "hi", label: "Hindi", nativeLabel: "हिंदी" },
    { value: "mr", label: "Marathi", nativeLabel: "मराठी" },
  ];

  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";
  const userName = user?.name || "User";
  const userEmail = user?.email || "";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "N/A";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("settings", language)}</h1>
        <p className="text-muted-foreground mt-1">
          Customize your LifeFlow experience
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette size={18} className="text-primary" />
              {t("darkMode", language)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                variant={mounted && theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun size={16} className="mr-2" />
                Light
              </Button>
              <Button
                variant={mounted && theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon size={16} className="mr-2" />
                Dark
              </Button>
              <Button
                variant={mounted && theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                className="flex-1"
              >
                System
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe size={18} className="text-primary" />
              {t("language", language)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setLanguage(lang.value)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    language === lang.value
                      ? "gradient-bg text-white"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{lang.label}</span>
                  <span className="text-sm opacity-70">{lang.nativeLabel}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={18} className="text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {user?.image ? (
                <img
                  src={user.image}
                  alt={userName}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full gradient-bg flex items-center justify-center text-white text-2xl font-bold">
                  {userInitial}
                </div>
              )}
              <div>
                <p className="font-semibold text-lg">{userName}</p>
                <p className="text-sm text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground">Member since</p>
                <p className="text-sm font-medium">{memberSince}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">Get notified about reminders</p>
              </div>
              <div className="w-10 h-6 rounded-full bg-primary relative">
                <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div>
                <p className="text-sm font-medium">Email Alerts</p>
                <p className="text-xs text-muted-foreground">Daily summary email</p>
              </div>
              <div className="w-10 h-6 rounded-full bg-muted relative">
                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div>
                <p className="text-sm font-medium">Voice Responses</p>
                <p className="text-xs text-muted-foreground">TTS for assistant replies</p>
              </div>
              <div className="w-10 h-6 rounded-full bg-primary relative">
                <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send size={18} className="text-primary" />
              Telegram Bot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {telegramLinked ? (
              <>
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <Link2 size={14} />
                    Linked to Telegram
                  </div>
                  {telegramAccounts.map((acc) => (
                    <p key={String(acc.telegramId)} className="text-xs text-muted-foreground mt-1">
                      {acc.name || "Telegram user"} — linked {new Date(acc.linkedAt).toLocaleDateString()}
                    </p>
                  ))}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUnlink}
                  disabled={unlinkLoading}
                  className="w-full"
                >
                  <Unlink size={14} className="mr-2" />
                  {unlinkLoading ? "Unlinking..." : "Unlink Telegram"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your Telegram account to receive daily summaries, reminders, and manage your life from chat.
                </p>
                {linkCode ? (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-2">Your link code (expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")})</p>
                      <p className="text-3xl font-mono font-bold tracking-widest">{linkCode}</p>
                    </div>
                    <Button
                      onClick={() => window.open(`https://t.me/LifeFlowCopilotBot?start=${linkCode}`, "_blank")}
                      className="w-full gradient-bg text-white"
                    >
                      <Send size={14} className="mr-2" />
                      Open Telegram &amp; Link
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyCode} className="flex-1">
                        {codeCopied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
                        {codeCopied ? "Copied!" : "Copy Code"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleGenerateLink} disabled={linkLoading} className="flex-1">
                        Regenerate
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={handleGenerateLink} disabled={linkLoading} className="w-full gradient-bg text-white">
                    <Link2 size={14} className="mr-2" />
                    {linkLoading ? "Generating..." : "Link Telegram Account"}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            Data & Privacy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your data is stored securely. You have full control over your data.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Export Data</Button>
              <Button variant="destructive" size="sm">Delete All Data</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
                className="ml-auto"
              >
                <LogOut size={14} className="mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
