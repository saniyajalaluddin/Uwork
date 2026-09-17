"use client";

import React, { useState, useEffect } from "react";
import { Lightbulb, CheckCircle2, ArrowRight } from "lucide-react";

export default function InsightsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
      });
  }, []);

  const decisions = data?.decisionItems || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Decision Center & Insights</h1>
        <p className="text-xs text-slate-400 mt-1">
          Evidence-linked business recommendations formulated directly from verified analytical metrics.
        </p>
      </div>

      <div className="space-y-4">
        {decisions.map((item: any) => (
          <div key={item.id} className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                {item.priority} PRIORITY
              </span>
            </div>
            <p className="text-xs text-slate-300">{item.impactSummary}</p>
            <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 text-xs text-blue-300 font-medium">
              Recommended Action: {item.recommendedAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

