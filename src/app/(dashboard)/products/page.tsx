"use client";

import React, { useState, useEffect } from "react";
import { Package, Sparkles, TrendingUp, DollarSign } from "lucide-react";

export default function ProductsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/products")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-xs text-slate-400">Classifying product catalog into BCG Matrix...</p>
        </div>
      </div>
    );
  }

  const matrix = data?.bcgMatrix || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Product Intelligence & BCG Matrix</h1>
        <p className="text-xs text-slate-400 mt-1">
          Portfolio analysis categorizing offerings into Stars, Cash Cows, Question Marks, and Dogs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matrix.map((cat: any) => (
          <div key={cat.category} className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{cat.category}</span>
                <h3 className="text-sm font-bold text-white mt-0.5">{cat.title}</h3>
              </div>
            </div>

            <div className="space-y-3">
              {cat.products.map((p: any) => (
                <div key={p.name} className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-white">{p.name}</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {p.growthPct >= 0 ? `+${p.growthPct}%` : `${p.growthPct}%`} YoY
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Revenue: <strong className="text-slate-200">${((p.revenue || 0) / 1000000).toFixed(2)}M</strong></span>
                    <span>Gross Margin: <strong className="text-slate-200">{p.marginPct}%</strong></span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-700/50 text-[11px] text-blue-300">
                    Strategy: {p.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

