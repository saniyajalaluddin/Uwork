"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  Radio,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RefreshCw,
  Clock,
  Activity,
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  metricCode: string;
  condition: string;
  thresholdValue: number;
  cooldownHours: number;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  data: any;
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveEvent[]>([]);
  const [sseStatus, setSseStatus] = useState<"CONNECTED" | "CONNECTING" | "DISCONNECTED">(
    "CONNECTING"
  );
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Rule Form State
  const [name, setName] = useState("");
  const [metricCode, setMetricCode] = useState("TOTAL_REVENUE");
  const [condition, setCondition] = useState("DROPS_BY_PCT");
  const [thresholdValue, setThresholdValue] = useState("10");
  const [cooldownHours, setCooldownHours] = useState("24");
  const [submitting, setSubmitting] = useState(false);

  // Fetch configured rules
  const fetchRules = async () => {
    try {
      const res = await fetch("/api/alerts");
      const json = await res.json();
      if (json.success) {
        setRules(json.data.alerts);
      }
    } catch (err) {
      console.error("Failed to fetch alert rules:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();

    // Setup Server-Sent Events (SSE) live push stream
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource("/api/events/sse");

      eventSource.addEventListener("open", () => {
        setSseStatus("CONNECTED");
      });

      eventSource.addEventListener("CONNECTED", (e) => {
        setSseStatus("CONNECTED");
      });

      eventSource.addEventListener("ALERT_TRIGGERED", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveFeed((prev) => [payload, ...prev].slice(0, 30));
          // Refresh rules to reflect lastTriggeredAt
          fetchRules();
        } catch {}
      });

      eventSource.addEventListener("ANOMALY_ALERT", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveFeed((prev) => [payload, ...prev].slice(0, 30));
        } catch {}
      });

      eventSource.addEventListener("DATASET_READY", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveFeed((prev) => [payload, ...prev].slice(0, 30));
        } catch {}
      });

      eventSource.addEventListener("FORECAST_COMPLETED", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveFeed((prev) => [payload, ...prev].slice(0, 30));
        } catch {}
      });

      eventSource.onerror = () => {
        setSseStatus("DISCONNECTED");
      };
    } catch (err) {
      setSseStatus("DISCONNECTED");
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentStatus }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isActive: !currentStatus } : r))
        );
      }
    } catch (err) {
      console.error("Toggle alert error:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error("Delete alert error:", err);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          metricCode,
          condition,
          thresholdValue: Number(thresholdValue),
          cooldownHours: Number(cooldownHours),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => [json.data.alert, ...prev]);
        setShowAddModal(false);
        setName("");
      }
    } catch (err) {
      console.error("Create alert error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell className="h-6 w-6 text-blue-400" /> Alerts & Real-Time Event Bus
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time SSE event streaming, automated metric threshold monitors, and anti-spam cooldowns.
          </p>
        </div>

        {/* SSE Stream Status & Add Rule */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${
              sseStatus === "CONNECTED"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : sseStatus === "CONNECTING"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}
          >
            <Radio
              className={`h-3 w-3 ${
                sseStatus === "CONNECTED" ? "animate-pulse text-emerald-400" : ""
              }`}
            />
            <span>SSE {sseStatus}</span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add Rule
          </button>
        </div>
      </div>

      {/* Grid: Configured Rules vs Real-Time Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Configured Rules */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" /> Active Alert Rules ({rules.length})
              </h3>
              <button
                onClick={fetchRules}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading alert rules...</div>
            ) : rules.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No alert rules configured yet. Click "Add Rule" to configure an automated monitor.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="py-3.5 flex items-center justify-between text-xs transition hover:bg-slate-800/20 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          rule.isActive
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        <Bell className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          {rule.name}
                          {!rule.isActive && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">
                              PAUSED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Metric: <span className="text-slate-200">{rule.metricCode}</span> • Condition:{" "}
                          <span className="text-blue-300">
                            {rule.condition} {rule.thresholdValue}
                            {rule.condition === "DROPS_BY_PCT" ? "%" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-[10px] text-slate-400">
                        <div>Cooldown: {rule.cooldownHours}h</div>
                        {rule.lastTriggeredAt && (
                          <div className="text-amber-400/80 flex items-center gap-1 justify-end">
                            <Clock className="h-2.5 w-2.5" />{" "}
                            {new Date(rule.lastTriggeredAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleToggleActive(rule.id, rule.isActive)}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold transition border ${
                          rule.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {rule.isActive ? "ACTIVE" : "ENABLE"}
                      </button>

                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                        title="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Real-Time SSE Event Stream */}
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" /> Live Event Bus Feed
              </h3>
              <span className="text-[10px] text-slate-500">{liveFeed.length} events</span>
            </div>

            {liveFeed.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <Radio className="h-6 w-6 text-slate-600 mx-auto animate-pulse" />
                <p>Waiting for real-time events...</p>
                <p className="text-[10px] text-slate-600">
                  Trigger an anomaly, upload a dataset, or generate a forecast to see live SSE broadcasts.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {liveFeed.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 text-xs space-y-1 animate-fadeIn"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-amber-400">{evt.type}</span>
                      <span className="text-slate-500">
                        {new Date(evt.timestamp || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-300 font-medium">
                      {evt.data?.name || evt.data?.metricName || evt.data?.reason || "Event triggered"}
                    </div>
                    {evt.data?.currentValue !== undefined && (
                      <div className="text-[10px] text-slate-400">
                        Value: <span className="text-white">{evt.data.currentValue}</span> (Threshold:{" "}
                        {evt.data.thresholdValue})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Create Automated Alert Rule</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sudden Revenue Drop"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Metric Code</label>
                  <select
                    value={metricCode}
                    onChange={(e) => setMetricCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="TOTAL_REVENUE">TOTAL_REVENUE</option>
                    <option value="NET_PROFIT">NET_PROFIT</option>
                    <option value="MARGIN">MARGIN</option>
                    <option value="SALES_VOLUME">SALES_VOLUME</option>
                    <option value="ANOMALY">ANOMALY</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="DROPS_BY_PCT">DROPS_BY_PCT</option>
                    <option value="GREATER_THAN">GREATER_THAN</option>
                    <option value="LESS_THAN">LESS_THAN</option>
                    <option value="ANOMALY_DETECTED">ANOMALY_DETECTED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Threshold Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Cooldown (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cooldownHours}
                    onChange={(e) => setCooldownHours(e.target.value)}
                    placeholder="24"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Create Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
