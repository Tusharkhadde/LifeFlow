"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { AuroraHero } from "@/components/ui/aurora-hero";
import { Zap, Sun, Moon, ArrowLeft } from "lucide-react";
import { FaGithub, FaGoogle } from "react-icons/fa";

export default function LoginPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<"email" | "username">("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let result;
      if (loginMethod === "email") {
        result = await signIn.email({ email, password });
      } else {
        result = await signIn.username({ username, password });
      }
      if (result.error) {
        setError(result.error.message || "Invalid credentials");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: "github" | "google") {
    setError("");
    try {
      await signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
    } catch {
      setError("Social login failed");
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <AuroraHero title="Welcome Back" />
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center px-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Your Life, <br />Organized.
            </h2>
            <p className="text-white/80 max-w-md">
              Sign in to access your personalized dashboard with AI-powered insights.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={18} />
              <span>Back</span>
            </Link>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="text-white" size={20} />
            </div>
            <span className="text-2xl font-bold gradient-text">LifeFlow AI</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold mb-2">Sign in</h1>
          <p className="text-muted-foreground mb-6">
            Enter your credentials to access your account
          </p>

          {/* Social Login Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => handleSocialLogin("github")}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors font-medium text-sm"
            >
              <FaGithub size={18} />
              GitHub
            </button>
            <button
              onClick={() => handleSocialLogin("google")}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors font-medium text-sm"
            >
              <FaGoogle size={18} />
              Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or continue with</span>
            </div>
          </div>

          {/* Login Method Toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6">
            <button
              onClick={() => setLoginMethod("email")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                loginMethod === "email"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setLoginMethod("username")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                loginMethod === "username"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Username
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}
            {loginMethod === "email" ? (
              <div>
                <label htmlFor="email" className="text-sm font-medium block mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="username" className="text-sm font-medium block mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>
            )}
            <div>
              <label htmlFor="password" className="text-sm font-medium block mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl gradient-bg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
