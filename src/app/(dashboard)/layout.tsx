"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Package,
  LineChart,
  AlertTriangle,
  Lightbulb,
  FileText,
  Database,
  Layers,
  Bell,
  Bot,
  Settings,
  ShieldCheck,
  ChevronDown,
  Search,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import GlobalSearchModal from "@/components/layout/GlobalSearchModal";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navSections: { section: string; items: NavItem[] }[] = [
  {
    section: "Intelligence & Dashboards",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Sales Intelligence", href: "/sales", icon: TrendingUp },
      { label: "Revenue Intelligence", href: "/revenue", icon: DollarSign },
      { label: "Customer Intelligence", href: "/customers", icon: Users },
      { label: "Product Intelligence", href: "/products", icon: Package },
    ],
  },
  {
    section: "Advanced Machine Learning",
    items: [
      { label: "Forecasting Engine", href: "/forecasting", icon: LineChart, badge: "AI" },
      { label: "Anomaly Detection", href: "/anomalies", icon: AlertTriangle, badge: "2" },
      { label: "Decision Center", href: "/insights", icon: Lightbulb },
      { label: "AI Business Assistant", href: "/assistant", icon: Bot, badge: "Agent" },
    ],
  },
  {
    section: "Data & Operations",
    items: [
      { label: "Data Hub", href: "/data-hub", icon: Database },
      { label: "Reports & Exports", href: "/reports", icon: FileText },
      { label: "Integrations", href: "/integrations", icon: Layers },
      { label: "Alerts & Triggers", href: "/alerts", icon: Bell },
      { label: "Settings & Audit", href: "/settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.success) {
          setUser(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const userProfile = user?.user;
  const orgName = user?.organization?.name || "Apex Global Tech";
  const userRole = user?.role || "ANALYST";
  const fullName = userProfile?.firstName
    ? `${userProfile.firstName} ${userProfile.lastName || ""}`.trim()
    : userProfile?.email || "Loading User...";
  const userInitials =
    ((userProfile?.firstName?.[0] || "") + (userProfile?.lastName?.[0] || "")).toUpperCase() ||
    (userProfile?.email?.[0] || "U").toUpperCase();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/90 backdrop-blur-md select-none">
        {/* Brand */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            U
          </div>
          <div>
            <div className="font-bold tracking-tight text-white flex items-center gap-1.5">
              UWORK <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">PRO</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Business Intelligence</div>
          </div>
        </div>

        {/* Tenant Switcher */}
        <div className="p-3">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition cursor-pointer">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-6 w-6 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-bold shrink-0">
                {orgName[0]?.toUpperCase() || "A"}
              </div>
              <div className="truncate text-left">
                <div className="text-xs font-semibold text-slate-200 truncate">{orgName}</div>
                <div className="text-[10px] text-slate-400">Enterprise Workspace</div>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5 text-xs">
          {navSections.map((sec, idx) => (
            <div key={idx}>
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {sec.section}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-all ${
                        isActive
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Dynamic User Card */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 transition">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-md">
                {userInitials}
              </div>
              <div className="truncate text-left">
                <div className="text-xs font-semibold text-slate-200 truncate">{fullName}</div>
                <div className="text-[10px] text-emerald-400 font-medium truncate flex items-center gap-1">
                  <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase">{userRole}</span>
                  <span className="text-slate-400 truncate">({userProfile?.email || "..."})</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="text-slate-400 hover:text-red-400 transition p-1.5 rounded hover:bg-slate-800 shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-slate-800 text-slate-300"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 text-xs text-slate-400 w-80 cursor-pointer transition"
            >
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-400 text-xs">Search metrics, forecasts, products...</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                Ctrl+K
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Pipeline Active
            </div>

            <Link
              href="/anomalies"
              className="relative p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-slate-300 hover:text-white transition"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></span>
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-sm flex">
            <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
                    U
                  </div>
                  <span className="font-bold text-white text-sm">UWORK PRO</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-4 text-xs">
                {navSections.map((sec, idx) => (
                  <div key={idx}>
                    <div className="px-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase">
                      {sec.section}
                    </div>
                    <div className="space-y-0.5">
                      {sec.items.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium ${
                              isActive
                                ? "bg-blue-600 text-white font-semibold"
                                : "text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </div>
                            {item.badge && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">
                    {userInitials}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-white">{fullName}</div>
                    <div className="text-[10px] text-emerald-400 font-medium uppercase">{userRole}</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 p-1"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Scrollable Workspace */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>

        <GlobalSearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      </div>
    </div>
  );
}

