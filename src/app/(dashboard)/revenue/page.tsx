"use client";

import React, { useState, useEffect } from "react";
import { DollarSign, TrendingUp, PieChart, Layers } from "lucide-react";

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
      });
  }, []);

  const kpis = data?.kpis || {};
  const products = data?.topProducts || [];
  const regions = data?.topRegions || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Revenue Intelligence</h1>
        <p className="text-xs text-slate-400 mt-1">
          Revenue streams, margin breakdowns, territory contributions, and billing concentration.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Total Net Revenue</div>
          <div className="text-2xl font-bold text-white mt-1">
            ${((kpis.totalRevenue || 0) / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-emerald-400 mt-1">+{kpis.revenueGrowthMoM}% MoM Growth</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Gross Profit Contribution</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            ${((kpis.grossProfit || 0) / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-slate-400 mt-1">Gross Margin: {kpis.grossMarginPct}%</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Top 10 Accounts Concentration</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">39.0%</div>
          <div className="text-xs text-slate-400 mt-1">Balanced enterprise risk ratio</div>
        </div>
      </div>

      {/* Regional & Product Revenue Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white">Revenue Contribution by Region</h3>
          <div className="space-y-3">
            {regions.map((r: any) => (
              <div key={r.region} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                <div className="flex justify-between text-xs font-semibold text-slate-200">
                  <span>{r.region}</span>
                  <span>${((r.revenue || 0) / 1000000).toFixed(2)}M ({r.sharePct}%)</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${r.sharePct}%` }}></div>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Growth: +{r.growthPct}% YoY</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white">Revenue Contribution by Product Line</h3>
          <div className="space-y-3">
            {products.map((p: any) => (
              <div key={p.name} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                <div className="flex justify-between text-xs font-semibold text-slate-200">
                  <span>{p.name}</span>
                  <span>${((p.revenue || 0) / 1000000).toFixed(2)}M ({p.sharePct}%)</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${p.sharePct}%` }}></div>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Growth: +{p.growthPct}% YoY</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

