"use client";

import React, { useState, useEffect } from "react";
import {
  LineChart as LineChartIcon,
  Trophy,
  Activity,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
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
} from "recharts";

export default function ForecastingPage() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forecasts")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) {
          setForecasts(res.data.forecasts || []);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-xs text-slate-400">Loading forecasting models and backtest results...</p>
        </div>
      </div>
    );
  }

  const fc = forecasts[0];
  const run = fc?.latestRun;
  const metrics = run?.metrics || {};
  const candidates = run?.candidateScores || [];
  const drivers = run?.drivers || {};
  const predictions = run?.predictions || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Forecasting Engine</h1>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
              Walk-Forward Backtested
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Zero-leakage time-series modeling with automated algorithm tournament and prediction intervals.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>Horizon: {fc?.horizon || 6} Months Forward</span>
        </div>
      </div>

      {/* Champion Model Banner */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-blue-950/60 border border-indigo-500/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Champion Model Crowned
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                  sMAPE: {metrics.sMape}%
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                {run?.selectedModel || "Holt-Winters Triple Exponential Smoothing"}
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Selected by automated tournament based on out-of-time temporal backtesting. Models trend slope, multiplicative dampening, and annual seasonal spikes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">sMAPE</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{metrics.sMape}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">MAE</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">${metrics.mae?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">RMSE</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">${metrics.rmse?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">R² Fit</div>
              <div className="text-base font-bold text-blue-400 mt-0.5">{metrics.r2}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Model Tournament Table */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Algorithm Tournament Leaderboard</h3>
          <span className="text-xs text-slate-400">Strict temporal split — zero future data leakage</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Candidate Algorithm</th>
                <th className="py-2.5 px-3">Validation Loss (sMAPE)</th>
                <th className="py-2.5 px-3">RMSE</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {candidates.map((cand: any, idx: number) => (
                <tr key={cand.modelName || cand.model || idx} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3 font-bold text-slate-200">
                    {idx === 0 ? <span className="text-amber-400">🏆 #1</span> : `#${idx + 1}`}
                  </td>
                  <td className="py-3 px-3 font-medium text-white">{cand.modelName || cand.model}</td>
                  <td className="py-3 px-3 font-semibold text-emerald-400">{cand.sMape ?? cand.mape}%</td>
                  <td className="py-3 px-3 text-slate-300">${cand.rmse?.toLocaleString()}</td>

                  <td className="py-3 px-3">
                    {idx === 0 ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold text-[10px]">
                        Champion Selected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                        Contender Evaluated
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Projection Chart with Confidence Bands */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold text-white">
              6-Month Forward Forecast with 95% Confidence Bounds
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Empirical prediction interval width derives from residual standard error variance over the projection horizon.
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={predictions} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
              />
              <Area
                type="monotone"
                dataKey="upper"
                stroke="transparent"
                fill="#6366f1"
                fillOpacity={0.15}
                name="95% Upper Bound"
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="transparent"
                fill="#0f172a"
                fillOpacity={1}
                name="95% Lower Bound"
              />
              <Area
                type="monotone"
                dataKey="predicted"
                stroke="#818cf8"
                strokeWidth={2}
                fillOpacity={0}
                name="Expected Forecast"
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={0}
                name="Actual Historical"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

