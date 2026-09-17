"use client";

import React, { useState, useEffect } from "react";
import { TrendingUp, Users, Target, CheckCircle2, DollarSign } from "lucide-react";

export default function SalesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/sales")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-xs text-slate-400">Loading sales intelligence pipeline...</p>
        </div>
      </div>
    );
  }

  const overview = data?.overview || {};
  const funnel = data?.funnel || [];
  const reps = data?.bySalesperson || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Sales Intelligence</h1>
        <p className="text-xs text-slate-400 mt-1">
          Pipeline velocity, stage conversion rates, and salesperson quota performance.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Total Active Pipeline</div>
          <div className="text-2xl font-bold text-white mt-1">
            ${((overview.pipelineTotal || 0) / 1000000).toFixed(1)}M
          </div>
          <div className="text-xs text-emerald-400 mt-1">Weighted: ${((overview.weightedPipeline || 0) / 1000000).toFixed(1)}M</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Overall Win Rate</div>
          <div className="text-2xl font-bold text-white mt-1">{overview.winRatePct}%</div>
          <div className="text-xs text-blue-400 mt-1">{overview.dealsWonThisPeriod} Deals Won</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Avg Deal Size & Velocity</div>
          <div className="text-2xl font-bold text-white mt-1">
            ${(overview.averageDealSize || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Avg cycle: {overview.salesCycleDays} days</div>
        </div>
      </div>

      {/* Funnel & Reps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Funnel */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white">Sales Pipeline Funnel</h3>
          <div className="space-y-3">
            {funnel.map((stage: any) => (
              <div key={stage.stage} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                <div className="flex justify-between text-xs font-semibold text-slate-200">
                  <span>{stage.stage}</span>
                  <span>${((stage.value || 0) / 1000000).toFixed(1)}M ({stage.count} deals)</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full"
                    style={{ width: `${stage.conversionPct}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Conversion efficiency: {stage.conversionPct}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rep Leaderboard */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white">Sales Representative Performance</h3>
          <div className="divide-y divide-slate-800/60">
            {reps.map((rep: any, idx: number) => (
              <div key={rep.name} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-400">#{idx + 1}</span>
                  <div>
                    <div className="font-semibold text-white">{rep.name}</div>
                    <div className="text-[11px] text-slate-400">{rep.deals} deals closed</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-400">${(rep.revenue / 1000000).toFixed(2)}M</div>
                  <div className="text-[10px] text-slate-400">{rep.quotaPct}% of Quota</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

