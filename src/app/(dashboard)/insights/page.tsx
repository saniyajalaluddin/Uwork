"use client";

import React, { useState, useEffect } from "react";
import {
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Sparkles,
  RotateCcw,
  Check,
  Eye,
  Trash2,
  X,
  Zap,
  Filter,
} from "lucide-react";

export default function InsightsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [synthesizing, setSynthesizing] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<any | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Create Form states
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("HIGH");
  const [newCategory, setNewCategory] = useState("OPERATIONS");
  const [newImpact, setNewImpact] = useState("");
  const [newAction, setNewAction] = useState("");

  const loadDecisions = () => {
    fetch("/api/decisions")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) setItems(res.data.items || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDecisions();

    // Real-time SSE listener
    const eventSource = new EventSource("/api/events/sse");
    eventSource.addEventListener("DECISION_UPDATED", () => {
      loadDecisions();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleStatusTransition = async (
    id: string,
    targetStatus: string,
    notes?: string
  ) => {
    try {
      const res = await fetch("/api/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: targetStatus,
          resolutionNotes: notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? data.data.item : item))
        );
        if (resolveTarget) {
          setResolveTarget(null);
          setResolutionNotes("");
        }
      } else {
        alert(data.error?.message || "Failed to update decision status.");
      }
    } catch {
      alert("Error transitioning decision status.");
    }
  };

  const handleSynthesize = async () => {
    setSynthesizing(true);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SYNTHESIZE" }),
      });
      const data = await res.json();
      if (data.success) {
        loadDecisions();
        alert(data.data.message || "Synthesis complete!");
      }
    } catch {
      alert("Error synthesizing decisions.");
    } finally {
      setSynthesizing(false);
    }
  };

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newImpact.trim() || !newAction.trim()) return;

    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          priority: newPriority,
          category: newCategory,
          impactSummary: newImpact,
          recommendedAction: newAction,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewTitle("");
        setNewImpact("");
        setNewAction("");
        loadDecisions();
      } else {
        alert(data.error?.message || "Failed to create decision item.");
      }
    } catch {
      alert("Error creating decision item.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this decision item?")) return;
    try {
      const res = await fetch(`/api/decisions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } catch {
      alert("Failed to delete decision item.");
    }
  };

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && item.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Decision Center & Action Tracking
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Formulated business interventions with SLA timers, resolution auditing, and automated anomaly synthesis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSynthesize}
            disabled={synthesizing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{synthesizing ? "Synthesizing..." : "Synthesize Actions"}</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Decision</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">Filter by Status:</span>
          <div className="flex items-center gap-1">
            {["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === st
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Priority:</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Decision Cards List */}
      <div className="space-y-4">
        {filteredItems.map((item: any) => {
          const sla = item.sla || {};
          const isOverdue = sla.isOverdue;

          return (
            <div
              key={item.id}
              className={`p-5 rounded-xl border transition space-y-3.5 ${
                item.status === "RESOLVED"
                  ? "bg-slate-900/40 border-slate-800/60 opacity-80"
                  : item.status === "DISMISSED"
                  ? "bg-slate-950/40 border-slate-800/40 opacity-60"
                  : isOverdue
                  ? "bg-slate-900/90 border-rose-500/40 shadow-lg shadow-rose-950/20"
                  : "bg-slate-900/80 border-slate-800"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Lightbulb
                    className={`h-5 w-5 ${
                      item.priority === "CRITICAL"
                        ? "text-rose-400"
                        : item.priority === "HIGH"
                        ? "text-amber-400"
                        : "text-blue-400"
                    }`}
                  />
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Category */}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {item.category}
                  </span>

                  {/* Priority Badge */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      item.priority === "CRITICAL"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : item.priority === "HIGH"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}
                  >
                    {item.priority}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      item.status === "RESOLVED"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : item.status === "ACKNOWLEDGED"
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        : item.status === "DISMISSED"
                        ? "bg-slate-800 text-slate-500 border-slate-700"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}
                  >
                    {item.status}
                  </span>

                  {/* SLA Badge */}
                  {item.status !== "RESOLVED" && item.status !== "DISMISSED" && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 border ${
                        isOverdue
                          ? "bg-rose-950/40 text-rose-300 border-rose-500/30"
                          : "bg-slate-800/80 text-slate-300 border-slate-700"
                      }`}
                      title={`Target SLA: ${sla.targetHours}h`}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      <span>
                        {isOverdue
                          ? `Overdue (${Math.abs(sla.remainingHours)}h)`
                          : `${sla.remainingHours}h remaining`}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Impact */}
              <p className="text-xs text-slate-300 leading-relaxed">{item.impactSummary}</p>

              {/* Recommended Action */}
              <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 text-xs text-blue-300 font-medium flex items-start gap-2">
                <Zap className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-blue-200">Recommended Action: </span>
                  {item.recommendedAction}
                </div>
              </div>

              {/* Evidence & Metrics */}
              {item.evidence && Object.keys(item.evidence).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                  {Object.entries(item.evidence)
                    .filter(([k]) => k !== "resolutionNotes" && k !== "resolvedAt" && k !== "resolvedBy")
                    .map(([k, v]) => (
                      <div key={k} className="p-2 rounded bg-slate-800/40 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block capitalize">
                          {k.replace(/([A-Z])/g, " $1")}
                        </span>
                        <span className="text-white font-semibold font-mono text-[11px]">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Resolution Notes Banner */}
              {item.evidence?.resolutionNotes && (
                <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-emerald-200">Resolution Log: </span>
                    {item.evidence.resolutionNotes}
                    {item.evidence.resolvedAt && (
                      <span className="text-slate-400 text-[10px] block mt-0.5">
                        Resolved on {new Date(item.evidence.resolvedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-xs">
                <div className="text-[11px] text-slate-500">
                  Created {new Date(item.createdAt).toLocaleDateString()}
                </div>

                <div className="flex items-center gap-2">
                  {item.status === "OPEN" && (
                    <>
                      <button
                        onClick={() => handleStatusTransition(item.id, "ACKNOWLEDGED")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Acknowledge</span>
                      </button>
                      <button
                        onClick={() => setResolveTarget(item)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-sm transition flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>Resolve Action</span>
                      </button>
                      <button
                        onClick={() => handleStatusTransition(item.id, "DISMISSED")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-300 text-[11px] font-medium transition"
                      >
                        Dismiss
                      </button>
                    </>
                  )}

                  {item.status === "ACKNOWLEDGED" && (
                    <>
                      <button
                        onClick={() => setResolveTarget(item)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-sm transition flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>Resolve Action</span>
                      </button>
                      <button
                        onClick={() => handleStatusTransition(item.id, "OPEN")}
                        className="px-2 py-1 rounded text-slate-400 hover:text-white text-[11px] transition flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reopen</span>
                      </button>
                      <button
                        onClick={() => handleStatusTransition(item.id, "DISMISSED")}
                        className="px-2 py-1 rounded text-slate-400 hover:text-slate-300 text-[11px] transition"
                      >
                        Dismiss
                      </button>
                    </>
                  )}

                  {(item.status === "RESOLVED" || item.status === "DISMISSED") && (
                    <button
                      onClick={() => handleStatusTransition(item.id, "OPEN")}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reopen Item</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition ml-1"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="py-16 text-center text-xs text-slate-400 p-8 rounded-xl bg-slate-900/40 border border-slate-800">
            {loading ? (
              "Loading Decision Center items..."
            ) : (
              <div className="space-y-3">
                <p>No decision items match the selected filter criteria.</p>
                <button
                  onClick={handleSynthesize}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
                >
                  Synthesize Decisions from Analytics
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RESOLVE ACTION MODAL */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Resolve Action Item</h3>
              <button
                onClick={() => setResolveTarget(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Record completion notes and audit details for <strong>{resolveTarget.title}</strong>:
            </p>

            <textarea
              rows={4}
              placeholder="e.g. Executed 1-year reserved compute instance with cloud provider. Margin recovered by 32%."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-xs text-white focus:outline-none focus:border-blue-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolveTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStatusTransition(resolveTarget.id, "RESOLVED", resolutionNotes)
                }
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE DECISION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create Decision Action Item</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDecision} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Optimize Cloud Compute in EU Region"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="CRITICAL">Critical (24h SLA)</option>
                    <option value="HIGH">High (72h SLA)</option>
                    <option value="MEDIUM">Medium (7d SLA)</option>
                    <option value="LOW">Low (14d SLA)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="REVENUE">Revenue</option>
                    <option value="PRICING">Pricing & Margins</option>
                    <option value="CUSTOMER">Customer Success</option>
                    <option value="OPERATIONS">Operations</option>
                    <option value="INVENTORY">Inventory</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Impact Summary</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe the quantified business impact or risk..."
                  value={newImpact}
                  onChange={(e) => setNewImpact(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Recommended Action</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Specific operational recommendation..."
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20"
                >
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
