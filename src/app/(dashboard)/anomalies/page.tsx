"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, ShieldAlert, Filter } from "lucide-react";

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/anomalies")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) setAnomalies(res.data.anomalies || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Anomaly Detection Engine</h1>
        <p className="text-xs text-slate-400 mt-1">
          Statistical deviations identified via Rolling Z-Score, IQR bounds, and seasonal residual filtering.
        </p>
      </div>

      <div className="space-y-4">
        {anomalies.map((anom) => (
          <div
            key={anom.id}
            className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <AlertCircle
                  className={`h-5 w-5 ${
                    anom.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"
                  }`}
                />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {anom.metricName} Variance Event ({anom.timestamp})
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    Detection Algorithm: <span className="text-blue-400 font-semibold">{anom.detectionMethod}</span>
                  </div>
                </div>
              </div>

              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  anom.severity === "CRITICAL"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {anom.severity} ({anom.deviationPct > 0 ? `+${anom.deviationPct}%` : `${anom.deviationPct}%`})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 text-xs">
              <div>
                <span className="text-slate-400">Observed Value:</span>{" "}
                <strong className="text-white">${anom.observedValue?.toLocaleString() ?? "0"}</strong>
              </div>
              <div>
                <span className="text-slate-400">Expected Baseline:</span>{" "}
                <strong className="text-slate-200">${anom.expectedValue?.toLocaleString() ?? "0"}</strong>
              </div>
              <div>
                <span className="text-slate-400">Attribution Confidence:</span>{" "}
                <strong className="text-emerald-400">{(anom.rootCause?.confidenceScore * 100).toFixed(0)}%</strong>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              <strong className="text-blue-400">Root Cause Attribution:</strong> {anom.rootCause?.factor} across segment:{" "}
              <strong className="text-slate-200">{anom.rootCause?.segment}</strong>.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

