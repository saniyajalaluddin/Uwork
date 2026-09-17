"use client";

import React, { useState, useEffect } from "react";
import {
  Upload,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

export default function DataHubPage() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");

  const loadDatasets = () => {
    setLoading(true);
    fetch("/api/datasets")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (res?.success) {
          setDatasets(res.data.datasets || []);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", datasetName || selectedFile.name);

    try {
      const res = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setSelectedFile(null);
        setDatasetName("");
        loadDatasets();
        alert("Dataset uploaded and profiled successfully!");
      } else {
        alert(data.error?.message || "Upload failed");
      }
    } catch (err) {
      alert("Error uploading file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Data Hub & Profiler</h1>
          <p className="text-xs text-slate-400 mt-1">
            Central repository for ingesting, validating, profiling, and cleaning business datasets.
          </p>
        </div>
        <button
          onClick={loadDatasets}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Upload Box */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white">Ingest New Business Dataset</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
            CSV & XLSX
          </span>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Dataset Name
              </label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="e.g. Q3 Sales & Revenue Records"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                File (CSV / XLSX, max 50MB)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>All uploads scanned for formula injection (=, +, -, @) & MIME security.</span>
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-40 shadow-lg shadow-blue-600/20"
            >
              {uploading ? "Profiling & Storing..." : "Upload & Run Profiler"}
            </button>
          </div>
        </form>
      </div>

      {/* Dataset Inventory */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-white">Active Datasets ({datasets.length})</h2>

        {datasets.map((d) => {
          const v = d.latestVersion;
          return (
            <div
              key={d.id}
              className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{d.name}</h3>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-semibold">
                        Version {v?.versionNumber || 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{d.description || "Ingested business data stream."}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-slate-200">
                      Quality Score: <strong className="text-emerald-400">{v?.qualityScore}%</strong>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {v?.rowCount.toLocaleString()} rows • {v?.columnCount} columns
                    </div>
                  </div>
                </div>
              </div>

              {/* Column Schema Pills */}
              {v?.columns && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                    Inferred Schema & Semantic Roles:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {v.columns.map((c: any) => (
                      <div
                        key={c.name}
                        className="px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50 text-[11px] flex items-center gap-1.5"
                      >
                        <span className="font-semibold text-slate-200">{c.name}</span>
                        <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-300">
                          {c.inferredBusinessRole}
                        </span>
                        <span className="text-[9px] text-slate-400">({c.dataType})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

