"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Plus,
  Clock,
  Calendar,
  Trash2,
  Play,
  CheckCircle2,
  Mail,
  Filter,
  Layers,
  FileCode,
  FileSpreadsheet,
} from "lucide-react";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"reports" | "schedules">("reports");
  const [reports, setReports] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [runningSchedule, setRunningSchedule] = useState<string | null>(null);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [formatFilter, setFormatFilter] = useState<string>("ALL");

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleCron, setScheduleCron] = useState("0 9 * * 1");
  const [scheduleType, setScheduleType] = useState("EXECUTIVE_SUMMARY");
  const [scheduleRecipients, setScheduleRecipients] = useState("");

  const loadReports = () => {
    fetch("/api/reports")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) setReports(res.data.reports || []);
      })
      .finally(() => setLoading(false));
  };

  const loadSchedules = () => {
    fetch("/api/reports/schedules")
      .then((res) => res.json())
      .then((res) => {
        if (res?.success) setSchedules(res.data.schedules || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadReports();
    loadSchedules();

    // Listen to real-time SSE events
    const eventSource = new EventSource("/api/events/sse");
    eventSource.addEventListener("REPORT_READY", () => {
      loadReports();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleGenerate = async (
    type: "EXECUTIVE_SUMMARY" | "SALES_DEEP_DIVE" | "FORECAST_PROJECTION" | "DATA_QUALITY",
    format: "CSV" | "JSON" | "HTML"
  ) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format }),
      });
      const data = await res.json();
      if (data.success) {
        loadReports();
      } else {
        alert(data.error?.message || "Failed to generate report.");
      }
    } catch {
      alert("Error generating report");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      const res = await fetch(`/api/reports?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setReports((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      alert("Failed to delete report.");
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTitle.trim()) return;

    const recipients = scheduleRecipients
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    try {
      const res = await fetch("/api/reports/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: scheduleTitle,
          cronExpression: scheduleCron,
          reportType: scheduleType,
          recipients,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowScheduleModal(false);
        setScheduleTitle("");
        setScheduleRecipients("");
        loadSchedules();
      } else {
        alert(data.error?.message || "Failed to create schedule.");
      }
    } catch {
      alert("Error creating schedule.");
    }
  };

  const handleToggleSchedule = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/reports/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        loadSchedules();
      }
    } catch {
      alert("Failed to toggle schedule.");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this report schedule?")) return;
    try {
      const res = await fetch(`/api/reports/schedules?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setSchedules((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      alert("Failed to delete schedule.");
    }
  };

  const handleRunScheduleNow = async (scheduleId: string) => {
    setRunningSchedule(scheduleId);
    try {
      const res = await fetch("/api/reports/schedules/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId }),
      });
      const data = await res.json();
      if (data.success) {
        loadReports();
        loadSchedules();
        alert("Scheduled digest executed successfully! Generated report is in the Reports list.");
      }
    } catch {
      alert("Failed to trigger scheduled run.");
    } finally {
      setRunningSchedule(null);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
    if (formatFilter !== "ALL" && r.format !== formatFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reports & Scheduled Digests</h1>
          <p className="text-xs text-slate-400 mt-1">
            Generate, schedule, and audit multi-format executive intelligence digests with formula injection security.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "reports" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleGenerate("EXECUTIVE_SUMMARY", "CSV")}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Executive CSV</span>
              </button>
              <button
                onClick={() => handleGenerate("EXECUTIVE_SUMMARY", "HTML")}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition disabled:opacity-50"
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>Executive HTML</span>
              </button>
              <button
                onClick={() => handleGenerate("SALES_DEEP_DIVE", "CSV")}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Sales Deep Dive</span>
              </button>
              <button
                onClick={() => handleGenerate("FORECAST_PROJECTION", "JSON")}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition disabled:opacity-50"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Forecast JSON</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Schedule</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-800">
        <button
          onClick={() => setActiveTab("reports")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "reports"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Generated Reports ({reports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("schedules")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "schedules"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Scheduled Digests ({schedules.length})</span>
        </button>
      </div>

      {/* TAB 1: Generated Reports */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters:</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value="ALL">All Types</option>
                  <option value="EXECUTIVE_SUMMARY">Executive Summary</option>
                  <option value="SALES_DEEP_DIVE">Sales Deep Dive</option>
                  <option value="FORECAST_PROJECTION">Forecast Projection</option>
                  <option value="DATA_QUALITY">Data Quality</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Format:</span>
                <select
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value="ALL">All Formats</option>
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="HTML">HTML</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="divide-y divide-slate-800/60">
              {filteredReports.map((rep) => (
                <div key={rep.id} className="py-3.5 flex items-center justify-between text-xs gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        rep.format === "HTML"
                          ? "bg-purple-500/10 text-purple-400"
                          : rep.format === "JSON"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {rep.format === "HTML" ? (
                        <FileCode className="h-4 w-4" />
                      ) : rep.format === "JSON" ? (
                        <Layers className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{rep.title}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{rep.type.replace(/_/g, " ")}</span>
                        <span>•</span>
                        <span>By {rep.generatedBy?.firstName || "System"}</span>
                        <span>•</span>
                        <span>{new Date(rep.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        rep.format === "HTML"
                          ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                          : rep.format === "JSON"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : "bg-blue-500/10 text-blue-300 border-blue-500/20"
                      }`}
                    >
                      {rep.format}
                    </span>

                    <a
                      href={`/api/reports/${rep.id}/download`}
                      download
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-medium border border-slate-700 transition"
                      title="Download report file securely"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </a>

                    <button
                      onClick={() => handleDeleteReport(rep.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      title="Delete report"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {filteredReports.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  {loading
                    ? "Loading reports..."
                    : "No matching reports found. Click any of the generation buttons above to create an intelligence digest."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Scheduled Digests */}
      {activeTab === "schedules" && (
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Automated Digest Schedules ({schedules.length})</h3>
            <p className="text-[11px] text-slate-400">
              Digest engine automatically generates and delivers intelligence reports based on cron timers.
            </p>
          </div>

          <div className="divide-y divide-slate-800/60">
            {schedules.map((sch) => {
              let recipients: string[] = [];
              try {
                recipients = JSON.parse(sch.recipientsJson || "[]");
              } catch {}

              return (
                <div key={sch.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">{sch.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          sch.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {sch.isActive ? "ACTIVE" : "PAUSED"}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20">
                        {sch.reportType.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1 font-mono bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/50">
                        <Clock className="h-3 w-3 text-blue-400" />
                        <span>Cron: {sch.cronExpression}</span>
                      </div>

                      {sch.nextRunAt && (
                        <div className="flex items-center gap-1 text-slate-300">
                          <Calendar className="h-3 w-3 text-emerald-400" />
                          <span>Next run: {new Date(sch.nextRunAt).toLocaleString()}</span>
                        </div>
                      )}

                      {sch.lastRunAt && (
                        <div className="text-slate-500">
                          Last run: {new Date(sch.lastRunAt).toLocaleString()}
                        </div>
                      )}
                    </div>

                    {recipients.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <Mail className="h-3 w-3 text-slate-400" />
                        <span className="text-[11px] text-slate-400">Recipients:</span>
                        {recipients.map((r, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 sm:pt-0">
                    <button
                      onClick={() => handleRunScheduleNow(sch.id)}
                      disabled={runningSchedule === sch.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition disabled:opacity-50"
                      title="Run scheduled digest immediately"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{runningSchedule === sch.id ? "Running..." : "Run Now"}</span>
                    </button>

                    <button
                      onClick={() => handleToggleSchedule(sch.id, sch.isActive)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                        sch.isActive
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          : "bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30"
                      }`}
                    >
                      {sch.isActive ? "Pause" : "Resume"}
                    </button>

                    <button
                      onClick={() => handleDeleteSchedule(sch.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      title="Delete schedule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {schedules.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400">
                No scheduled digests configured yet. Click "Create Schedule" to automate weekly or monthly executive reports.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Create Automated Report Schedule</h3>
            <p className="text-xs text-slate-400">
              Configure recurring executive digests delivered automatically to designated stakeholders.
            </p>

            <form onSubmit={handleCreateSchedule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Schedule Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Executive Briefing"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Report Type</label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="EXECUTIVE_SUMMARY">Executive Summary</option>
                  <option value="SALES_DEEP_DIVE">Sales Deep Dive</option>
                  <option value="FORECAST_PROJECTION">Forecast Projections</option>
                  <option value="DATA_QUALITY">Data Quality & Schema Audit</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Cron Frequency</label>
                <select
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500 mb-1.5"
                >
                  <option value="0 9 * * 1">Every Monday at 9:00 AM (0 9 * * 1)</option>
                  <option value="0 9 * * *">Every Day at 9:00 AM (0 9 * * *)</option>
                  <option value="0 0 1 * *">1st of Every Month (0 0 1 * *)</option>
                  <option value="0 * * * *">Hourly (0 * * * *)</option>
                  <option value="*/15 * * * *">Every 15 Minutes (*/15 * * * *)</option>
                </select>
                <input
                  type="text"
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="Or custom 5-field cron expression"
                  className="w-full rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-1.5 font-mono text-[11px] text-slate-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Recipients (comma-separated emails)
                </label>
                <input
                  type="text"
                  placeholder="executive@apex.com, board@apex.com"
                  value={scheduleRecipients}
                  onChange={(e) => setScheduleRecipients(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition"
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
