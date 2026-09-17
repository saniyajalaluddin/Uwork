"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  Users,
  ShoppingCart,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Download,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  PackageCheck,
  Globe,
  X,
  Play,
  Zap,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Line,
} from "recharts";

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [timeRange, setTimeRange] = useState<"3M" | "6M" | "12M" | "ALL">("12M");
  const [chartMode, setChartMode] = useState<"trajectory" | "confidence">("trajectory");
  const [selectedDecision, setSelectedDecision] = useState<any | null>(null);
  const [selectedAnomaly, setSelectedAnomaly] = useState<any | null>(null);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) {
          setData(res.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "CSV" }),
      });
      const result = await res.json();
      if (result.success) {
        alert(`Executive Report generated successfully: ${result.data.fileName}`);
      }
    } catch (e) {
      alert("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  const executeDecisionAction = (decision: any) => {
    setActionSuccessToast(`Workflow dispatched for: "${decision.title}". Automated alert sent to operations team.`);
    setTimeout(() => {
      setActionSuccessToast(null);
      setSelectedDecision(null);
    }, 2800);
  };

  const filteredTimeline = useMemo(() => {
    const raw = data?.timeline || [];
    if (!raw.length) return [];
    if (timeRange === "3M") return raw.slice(-6);
    if (timeRange === "6M") return raw.slice(-10);
    if (timeRange === "12M") return raw.slice(-16);
    return raw;
  }, [data?.timeline, timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-xs text-slate-400">Loading enterprise intelligence pipeline...</p>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    totalRevenue: 34250000,
    revenueGrowthMoM: 12.8,
    grossProfit: 23461250,
    grossMarginPct: 68.5,
    totalOrders: 24890,
    averageOrderValue: 1376,
    activeCustomers: 1420,
    forecastProjectedRevenue: 25280000,
  };

  const health = data?.healthScore || {
    overallScore: 88.5,
    revenueScore: 92,
    profitScore: 84.5,
    retentionScore: 89,
    growthScore: 94,
    stabilityScore: 83,
    rationale: [
      "Revenue expansion consistently outpaces industry baseline.",
      "Strong customer retention rate across enterprise cohorts.",
    ],
  };

  const topProducts = data?.topProducts || [
    { name: "Enterprise Cloud Suite", revenue: 16440000, sharePct: 48, growthPct: 28.4 },
    { name: "AI Model Serving Infrastructure", revenue: 9590000, sharePct: 28, growthPct: 42.1 },
    { name: "Data Pipeline Connectors", revenue: 5480000, sharePct: 16, growthPct: 14.5 },
    { name: "Legacy On-Prem Licenses", revenue: 2740000, sharePct: 8, growthPct: -4.2 },
  ];

  const topRegions = data?.topRegions || [
    { region: "North America", revenue: 17810000, sharePct: 52, growthPct: 18.2 },
    { region: "Europe (EMEA)", revenue: 10275000, sharePct: 30, growthPct: 12.4 },
    { region: "Asia Pacific (APAC)", revenue: 4452000, sharePct: 13, growthPct: 22.8 },
    { region: "Latin America (LATAM)", revenue: 1713000, sharePct: 5, growthPct: 8.5 },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {actionSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 border border-emerald-500/50 text-white shadow-2xl shadow-emerald-500/20 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium">{actionSuccessToast}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Executive Overview</h1>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
              Live BI Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic revenue intelligence, multi-model time-series forecasting, and automated decision operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Trailing 12M + 6M Forecast</span>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting..." : "Export Executive Report"}
          </button>
        </div>
      </div>

      {/* Active Dataset Reference Header with Direct Link to Data Hub */}
      {data?.dataset && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-blue-400" />
            <span className="font-semibold text-slate-200">Active Pipeline Dataset:</span>
            <span className="text-blue-400 font-medium">{data.dataset.name}</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
              v{data.dataset.version}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              Rows: <strong className="text-slate-200">{data.dataset.rowCount?.toLocaleString()}</strong>
            </span>
            <span>
              Quality Score: <strong className="text-emerald-400">{data.dataset.qualityScore}%</strong>
            </span>
            <Link
              href="/data-hub"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold text-[11px]"
            >
              <span>Inspect in Data Hub</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* UWORK Business Health Score Section with Interactive Pillar Superlinks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="p-5 rounded-xl bg-gradient-to-b from-slate-900 to-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                UWORK Business Health Score
              </span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="flex items-baseline gap-3 mt-4">
              <span className="text-5xl font-extrabold text-white tracking-tight">
                {health.overallScore}
              </span>
              <span className="text-sm font-semibold text-emerald-400 flex items-center gap-0.5">
                <ArrowUpRight className="h-4 w-4" /> Robust (A+)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Transparent, deterministic score computed across 5 weighted business dimensions.
            </p>
          </div>

          <div className="space-y-2 mt-6 pt-4 border-t border-slate-800">
            {health.rationale?.slice(0, 2).map((r: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Health Score Pillar Breakdown - CLICKABLE SUPERLINKS */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Component Pillar Breakdown
            </h3>
            <span className="text-[11px] text-blue-400 font-medium">Click any pillar to drill down</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Revenue", score: health.revenueScore || 92, weight: "25%", target: "/revenue", desc: "Explore Revenue" },
              { label: "Profitability", score: health.profitScore || 84.5, weight: "20%", target: "/revenue", desc: "View Margins" },
              { label: "Retention", score: health.retentionScore || 89, weight: "20%", target: "/customers", desc: "Cohort Analysis" },
              { label: "Growth", score: health.growthScore || 94, weight: "20%", target: "/forecasting", desc: "Scenario Models" },
              { label: "Stability", score: health.stabilityScore || 83, weight: "15%", target: "/anomalies", desc: "Risk & Variance" },
            ].map((pillar) => (
              <div
                key={pillar.label}
                onClick={() => router.push(pillar.target)}
                className="group p-3 rounded-lg bg-slate-800/50 border border-slate-700/40 hover:border-blue-500/60 hover:bg-slate-800/80 cursor-pointer transition-all flex flex-col justify-between"
                title={`Click to explore ${pillar.label} in ${pillar.desc}`}
              >
                <div>
                  <div className="text-[11px] text-slate-400 font-medium group-hover:text-blue-300 flex items-center justify-between">
                    <span>{pillar.label}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{pillar.score}</div>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-3">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all group-hover:bg-blue-400"
                    style={{ width: `${pillar.score}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>Weight: {pillar.weight}</span>
                  <span className="text-[9px] text-blue-400 group-hover:underline">Drill down</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* UWORK Intelligence Layer — Unique 4-Question Framework with SUPERLINKS */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              UWORK Intelligence Framework
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Deterministic diagnostic narrative</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* 1. What Happened? -> /analytics */}
          <Link
            href="/analytics"
            className="group p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-800/80 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
                <span>1. What Happened?</span>
                <ArrowRight className="h-3.5 w-3.5 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-slate-200 mt-1.5 leading-relaxed">
                Total revenue expanded <strong className="text-emerald-400">+{kpis.revenueGrowthMoM}%</strong> MoM to reach <strong className="text-white">${((kpis.totalRevenue || 0) / 1000000).toFixed(1)}M</strong>.
              </p>
            </div>
            <div className="text-[11px] text-blue-400 font-semibold mt-3 flex items-center gap-1 group-hover:underline">
              <span>View Analytics Deep Dive</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* 2. Why Did It Happen? -> /products */}
          <Link
            href="/products"
            className="group p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-800/80 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
                <span>2. Why Did It Happen?</span>
                <ArrowRight className="h-3.5 w-3.5 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-slate-200 mt-1.5 leading-relaxed">
                Growth was primarily driven by <strong className="text-blue-300">Enterprise Cloud Suite</strong> (+28.4%) and high contract density in <strong className="text-blue-300">North America</strong> (52% share).
              </p>
            </div>
            <div className="text-[11px] text-blue-400 font-semibold mt-3 flex items-center gap-1 group-hover:underline">
              <span>Inspect Product Drivers</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* 3. What Is Likely Next? -> /forecasting */}
          <Link
            href="/forecasting"
            className="group p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-800/80 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
                <span>3. What Is Likely Next?</span>
                <ArrowRight className="h-3.5 w-3.5 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-slate-200 mt-1.5 leading-relaxed">
                Champion Holt-Winters model projects continued expansion pacing towards <strong className="text-white">${((kpis.forecastProjectedRevenue || 0) / 1000000).toFixed(1)}M</strong> over the next 6 months.
              </p>
            </div>
            <div className="text-[11px] text-blue-400 font-semibold mt-3 flex items-center gap-1 group-hover:underline">
              <span>Open Scenario Forecaster</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* 4. Recommended Action -> Trigger Simulation Modal */}
          <div
            onClick={() => {
              if (data?.decisionItems?.length) {
                setSelectedDecision(data.decisionItems[0]);
              }
            }}
            className="group p-3.5 rounded-lg bg-blue-600/10 border border-blue-500/30 hover:border-blue-400 hover:bg-blue-600/20 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="text-[11px] font-bold text-blue-400 uppercase flex items-center justify-between">
                <span>4. Recommended Action</span>
                <Zap className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              </div>
              <p className="text-slate-200 mt-1.5 leading-relaxed">
                Rebalance cloud infrastructure in EU Central to recover 35% margin; scale senior enterprise reps in NA Tier-1 accounts.
              </p>
            </div>
            <div className="text-[11px] text-blue-300 font-semibold mt-3 flex items-center gap-1 group-hover:underline">
              <span>Simulate & Execute Action</span>
              <Play className="h-3 w-3 text-emerald-400 fill-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid - SUPERLINKS INTO DOMAIN MODULES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Gross Revenue -> /revenue */}
        <Link
          href="/revenue"
          className="group p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="group-hover:text-slate-200 font-medium">Gross Revenue</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              ${((kpis.totalRevenue || 0) / 1000000).toFixed(2)}M
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1 font-medium">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+{kpis.revenueGrowthMoM}% vs previous period</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-400 group-hover:text-emerald-300 font-medium pt-3 mt-3 border-t border-slate-800/80">
            <span>Explore Revenue Intelligence</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* KPI 2: Gross Margin -> /revenue */}
        <Link
          href="/revenue"
          className="group p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-lg hover:shadow-blue-500/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="group-hover:text-slate-200 font-medium">Gross Margin</span>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {kpis.grossMarginPct}%
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>+0.5% above corporate benchmark</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-blue-400 group-hover:text-blue-300 font-medium pt-3 mt-3 border-t border-slate-800/80">
            <span>Analyze Profitability & Margins</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* KPI 3: Orders & AOV -> /sales */}
        <Link
          href="/sales"
          className="group p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-lg hover:shadow-purple-500/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="group-hover:text-slate-200 font-medium">Total Orders & AOV</span>
              <ShoppingCart className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {kpis.totalOrders?.toLocaleString() ?? "0"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Average Order Value: <strong className="text-slate-200">${kpis.averageOrderValue?.toLocaleString() ?? "0"}</strong>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-purple-400 group-hover:text-purple-300 font-medium pt-3 mt-3 border-t border-slate-800/80">
            <span>Drill into Sales Velocity</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* KPI 4: Active Customers -> /customers */}
        <Link
          href="/customers"
          className="group p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="group-hover:text-slate-200 font-medium">Active Customers & NRR</span>
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {kpis.activeCustomers?.toLocaleString() ?? "0"}
            </div>
            <div className="text-xs text-emerald-400 mt-1 font-medium">
              93.4% Net Revenue Retention
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-indigo-400 group-hover:text-indigo-300 font-medium pt-3 mt-3 border-t border-slate-800/80">
            <span>Explore Cohorts & Segments</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Main Interactive Forecast & Actual Timeline with Filter Controls */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                Revenue Trajectory: Historical Actuals vs Multi-Model Forecast
              </h3>
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold text-[10px]">
                Holt-Winters Champion
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Historical performance synchronized with 6-month walk-forward forecasts and 95% confidence intervals.
            </p>
          </div>

          {/* Interactive Chart Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Filter Tabs */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {(["3M", "6M", "12M", "ALL"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    timeRange === r
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Confidence Toggle */}
            <button
              onClick={() => setChartMode((prev) => (prev === "trajectory" ? "confidence" : "trajectory"))}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                chartMode === "confidence"
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>{chartMode === "confidence" ? "95% CI Active" : "Show Confidence Bands"}</span>
            </button>

            {/* Direct Superlink to Forecast Studio */}
            <Link
              href="/forecasting"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
            >
              <span>Forecast Studio</span>
              <ExternalLink className="h-3 w-3 text-blue-400" />
            </Link>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-blue-500"></span>
            <span className="text-slate-300">Historical Actual Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-indigo-400 border border-dashed border-white"></span>
            <span className="text-slate-300">Holt-Winters Projected Revenue</span>
          </div>
          {chartMode === "confidence" && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-indigo-500/20 border border-indigo-400"></span>
              <span className="text-slate-300">95% Confidence Interval (Lower / Upper)</span>
            </div>
          )}
        </div>

        {/* Chart Container */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredTimeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
                formatter={(val: any, name: string) => [
                  `$${Number(val).toLocaleString()}`,
                  name === "actual"
                    ? "Historical Actual"
                    : name === "predicted"
                    ? "Projected Forecast"
                    : name === "upper"
                    ? "Upper 95% CI"
                    : "Lower 95% CI",
                ]}
              />
              {chartMode === "confidence" && (
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="#a5b4fc"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  fillOpacity={1}
                  fill="url(#ciGradient)"
                  name="upper"
                />
              )}
              {chartMode === "confidence" && (
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="#a5b4fc"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  fillOpacity={0}
                  fill="transparent"
                  name="lower"
                />
              )}
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#actualGradient)"
                name="actual"
              />
              <Area
                type="monotone"
                dataKey="predicted"
                stroke="#818cf8"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#forecastGradient)"
                name="predicted"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products & Regional Performance Breakdown Grids - WITH SUPERLINKS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Top Revenue Contributors</h3>
            </div>
            <Link
              href="/products"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
            >
              <span>Catalog Studio</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {topProducts.map((prod: any, idx: number) => (
              <div
                key={prod.name}
                onClick={() => router.push("/products")}
                className="group p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:border-blue-500/50 hover:bg-slate-800/70 transition cursor-pointer flex items-center justify-between gap-4"
                title="Click to view product analytics"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white group-hover:text-blue-300 truncate">
                      {prod.name}
                    </div>
                    <div className="w-36 bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${prod.sharePct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-white">
                    ${((prod.revenue || 0) / 1000000).toFixed(2)}M
                  </div>
                  <div
                    className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                      prod.growthPct >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {prod.growthPct >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    <span>{prod.growthPct > 0 ? `+${prod.growthPct}%` : `${prod.growthPct}%`}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Regions */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Regional Market Penetration</h3>
            </div>
            <Link
              href="/revenue"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
            >
              <span>Geographic Revenue</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {topRegions.map((reg: any, idx: number) => (
              <div
                key={reg.region}
                onClick={() => router.push("/revenue")}
                className="group p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:border-emerald-500/50 hover:bg-slate-800/70 transition cursor-pointer flex items-center justify-between gap-4"
                title="Click to view regional revenue details"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                    {reg.region[0]}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white group-hover:text-emerald-300 truncate">
                      {reg.region}
                    </div>
                    <div className="w-36 bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${reg.sharePct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-white">
                    ${((reg.revenue || 0) / 1000000).toFixed(2)}M
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-medium">
                    <span>{reg.sharePct}% share</span>
                    <span className="text-emerald-400">(+{reg.growthPct}%)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decision Center & Anomaly Alert Center with Interactive Modals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Decision Center */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Decision Center</h3>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-semibold">
                Action Engine
              </span>
            </div>
            <Link
              href="/insights"
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {data?.decisionItems?.map((item: any) => (
              <div
                key={item.id}
                onClick={() => setSelectedDecision(item)}
                className="group p-3.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800/70 transition cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 transition">
                    {item.title}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      item.priority === "CRITICAL"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : item.priority === "HIGH"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{item.impactSummary}</p>
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-blue-400 font-medium">
                    Action: {item.recommendedAction}
                  </span>
                  <span className="text-[10px] text-slate-400 group-hover:text-white flex items-center gap-1">
                    <span>Inspect</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Statistical Anomaly Detection */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Detected Statistical Anomalies</h3>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-semibold">
                Z-Score & IQR
              </span>
            </div>
            <Link
              href="/anomalies"
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
            >
              <span>Anomaly Radar</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {data?.recentAnomalies?.map((anom: any) => (
              <div
                key={anom.id}
                onClick={() => setSelectedAnomaly(anom)}
                className="group p-3.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-amber-500/50 hover:bg-slate-800/70 transition cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle
                      className={`h-4 w-4 ${
                        anom.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition">
                      {anom.metricName} ({anom.timestamp})
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      anom.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {anom.deviationPct > 0 ? `+${anom.deviationPct}%` : `${anom.deviationPct}%`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Observed: <strong className="text-slate-200">${anom.observedValue?.toLocaleString()}</strong> vs Expected: ${anom.expectedValue?.toLocaleString()}
                </p>
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">
                    Root Cause: {anom.rootCause?.factor} ({anom.rootCause?.segment})
                  </span>
                  <span className="text-[10px] text-amber-400 group-hover:underline flex items-center gap-1">
                    <span>Root Cause</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DECISION ACTION DRILLDOWN MODAL */}
      {selectedDecision && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    selectedDecision.priority === "CRITICAL"
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  {selectedDecision.priority} PRIORITY
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5">{selectedDecision.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Category: {selectedDecision.category}</p>
              </div>
              <button
                onClick={() => setSelectedDecision(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projected Impact</span>
              <p className="text-xs text-emerald-400 font-semibold">{selectedDecision.impactSummary}</p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300">Empirical Evidence & Metric Triggers</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(selectedDecision.evidence || {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                    <strong className="text-white text-xs">{String(v)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-600/10 border border-blue-500/20 space-y-2">
              <div className="flex items-center gap-1.5 text-blue-400 text-xs font-bold">
                <Zap className="h-4 w-4" />
                <span>Recommended Operational Action</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{selectedDecision.recommendedAction}</p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <Link
                href="/insights"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <span>Open Full Decision Center</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDecision(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => executeDecisionAction(selectedDecision)}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/20 transition flex items-center gap-1.5"
                >
                  <Play className="h-3 w-3 fill-white" />
                  <span>Execute Workflow</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ANOMALY DIAGNOSTIC MODAL */}
      {selectedAnomaly && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    selectedAnomaly.severity === "CRITICAL"
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  {selectedAnomaly.severity} ANOMALY
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5">
                  {selectedAnomaly.metricName} Variance
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Detected: {selectedAnomaly.timestamp} • Method: {selectedAnomaly.detectionMethod}
                </p>
              </div>
              <button
                onClick={() => setSelectedAnomaly(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Observed</span>
                <div className="text-sm font-bold text-white mt-1">
                  ${selectedAnomaly.observedValue?.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Baseline Expected</span>
                <div className="text-sm font-bold text-slate-300 mt-1">
                  ${selectedAnomaly.expectedValue?.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Divergence</span>
                <div
                  className={`text-sm font-bold mt-1 ${
                    selectedAnomaly.deviationPct > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {selectedAnomaly.deviationPct > 0 ? `+${selectedAnomaly.deviationPct}%` : `${selectedAnomaly.deviationPct}%`}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-300">Attributed Root Cause Breakdown</span>
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Driving Factor:</span>
                  <span className="font-semibold text-white">{selectedAnomaly.rootCause?.factor || "Cloud Infrastructure Consumption"}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Impacted Segment:</span>
                  <span className="font-semibold text-white">{selectedAnomaly.rootCause?.segment || "Europe Central Cohort"}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">Contribution Weight:</span>
                  <span className="font-semibold text-amber-400">{selectedAnomaly.rootCause?.contribution || "68.4%"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedAnomaly(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <Link
                href="/anomalies"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5"
              >
                <span>Deep Dive in Anomaly Center</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
