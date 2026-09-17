"use client";

import React from "react";
import { Bell, ShieldAlert, CheckCircle2, Sliders } from "lucide-react";

export default function AlertsPage() {
  const alertRules = [
    {
      name: "Revenue Contraction Watchdog",
      metric: "Gross Revenue (MoM)",
      condition: "Drops by more than 10.0%",
      status: "ACTIVE",
      cooldown: "24 hours",
    },
    {
      name: "Critical Statistical Anomaly Trigger",
      metric: "All Continuous Numerical Columns",
      condition: "Observed value exceeds 3.5 IQR or Z > 2.8",
      status: "ACTIVE",
      cooldown: "6 hours",
    },
    {
      name: "Gross Margin Threshold Guard",
      metric: "Gross Margin %",
      condition: "Falls below 65.0%",
      status: "ACTIVE",
      cooldown: "12 hours",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Alerts & Notification Triggers</h1>
        <p className="text-xs text-slate-400 mt-1">
          Automated threshold monitors and statistical anomaly triggers with spam prevention cooldowns.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white">Configured Rules ({alertRules.length})</h3>

        <div className="divide-y divide-slate-800/60">
          {alertRules.map((rule) => (
            <div key={rule.name} className="py-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-white">{rule.name}</div>
                  <div className="text-[11px] text-slate-400">
                    Metric: {rule.metric} • Condition: <span className="text-blue-300">{rule.condition}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">Cooldown: {rule.cooldown}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                  {rule.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

