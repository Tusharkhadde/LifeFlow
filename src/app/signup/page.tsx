"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { SignUp } from "@clerk/nextjs";
import { AuroraHero } from "@/components/ui/aurora-hero";
import { Zap, Sun, Moon, ArrowLeft } from "lucide-react";

export default function SignupPage() {
  const { theme, setTheme } = useTheme();

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
          <p className="text-muted-foreground mb-8">
            Get started with LifeFlow AI
          </p>

          {/* Clerk Sign Up Component */}
          <SignUp
            routing="path"
            path="/signup"
            signInUrl="/login"
            fallbackRedirectUrl="/dashboard"
          />

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
