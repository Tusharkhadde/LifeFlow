"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp, signIn } from "@/lib/auth-client";
import { AuroraHero } from "@/components/ui/aurora-hero";
import { Zap, Sun, Moon, ArrowLeft } from "lucide-react";
import { FaGithub, FaGoogle } from "react-icons/fa";

export default function SignupPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signUp.email({
        name,
        email,
        password,
        username: username || undefined,
      });
      if (result.error) {
        setError(result.error.message || "Failed to create account");
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
        <AuroraHero title="Get Started" />
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center px-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Start Your <br />Journey.
            </h2>
            <p className="text-white/80 max-w-md">
              Create an account to unlock AI-powered life management.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Signup Form */}
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
          <h1 className="text-3xl font-bold mb-2">Create account</h1>
          <p className="text-muted-foreground mb-6">
            Get started with LifeFlow AI
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
              <span className="bg-background px-2 text-muted-foreground">or continue with email</span>
            </div>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="name" className="text-sm font-medium block mb-1.5">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label htmlFor="username" className="text-sm font-medium block mb-1.5">
                Username <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
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
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl gradient-bg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
