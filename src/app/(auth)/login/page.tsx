"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@apex.com");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (data.success) {
        router.push("/overview");
      } else {
        setError(data.error?.message || "Invalid credentials");
      }
    } catch (err) {
      setError("Network error connecting to login service.");
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (demEmail: string) => {
    setEmail(demEmail);
    setPassword("Password123!");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 items-center justify-center font-bold text-white text-xl shadow-xl shadow-blue-500/20 mb-2">
            U
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            UWORK Platform
          </h1>
          <p className="text-xs text-slate-400">
            Enterprise Business Intelligence & Multi-Model Forecasting
          </p>
        </div>

        {/* Login Card */}
        <div className="p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? "Authenticating Session..." : "Sign In to Workspace"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
              Quick One-Click Demo Logins:
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDemoCredentials("admin@apex.com")}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 border border-slate-700/40 hover:bg-slate-800 text-[11px] text-slate-300 font-medium transition"
              >
                Owner
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials("analyst@apex.com")}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 border border-slate-700/40 hover:bg-slate-800 text-[11px] text-slate-300 font-medium transition"
              >
                Analyst
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials("viewer@apex.com")}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 border border-slate-700/40 hover:bg-slate-800 text-[11px] text-slate-300 font-medium transition"
              >
                Viewer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

