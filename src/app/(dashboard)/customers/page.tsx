"use client";

import React, { useState, useEffect } from "react";
import { Users, UserCheck, UserX, AlertTriangle, ShieldCheck } from "lucide-react";

export default function CustomersPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/customers")
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
          <p className="text-xs text-slate-400">Computing customer RFM segments...</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const segments = data?.rfmSegments || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Customer Intelligence & RFM</h1>
        <p className="text-xs text-slate-400 mt-1">
          Behavioral customer clustering based on Recency, Frequency, and Monetary value.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Total Client Accounts</div>
          <div className="text-2xl font-bold text-white mt-1">{summary.totalCustomers?.toLocaleString()}</div>
          <div className="text-xs text-emerald-400 mt-1">+{summary.newCustomersThisQuarter} this quarter</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Net Revenue Retention</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{summary.netRevenueRetention}%</div>
          <div className="text-xs text-slate-400 mt-1">World-class benchmark &gt;90%</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Churn Rate</div>
          <div className="text-2xl font-bold text-white mt-1">{summary.churnRatePct}%</div>
          <div className="text-xs text-slate-400 mt-1">Annualized cohort churn</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Customer Lifetime Value</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">${summary.customerLifetimeValue?.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Avg lifespan: {summary.averageCustomerLifespanMonths} mos</div>
        </div>
      </div>

      {/* RFM Segments */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white">RFM Behavioral Segments</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg: any) => (
            <div key={seg.segment} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{seg.segment}</span>
                <span className="text-xs font-semibold text-emerald-400">{seg.pct}% of Base</span>
              </div>
              <p className="text-xs text-slate-400">{seg.description}</p>
              <div className="pt-2 text-xs text-slate-300">
                Billing Contribution: <strong className="text-white">${((seg.revenue || 0) / 1000000).toFixed(1)}M</strong> ({seg.count} accounts)
              </div>
              <div className="pt-2 border-t border-slate-700/50 text-[11px] text-blue-400 font-medium">
                Action: {seg.action}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

