"use client";

import React from "react";
import { Layers, CheckCircle2, Lock, ShieldCheck, Database, FileSpreadsheet } from "lucide-react";

export default function IntegrationsPage() {
  const connectors = [
    {
      name: "CSV / XLSX File Stream Ingestion",
      status: "ACTIVE",
      type: "FILE_STORAGE",
      description: "Direct upload and streaming ingestion with formula injection protection.",
      isLive: true,
    },
    {
      name: "PostgreSQL Direct Database Warehouse",
      status: "CONFIGURABLE",
      type: "DATABASE",
      description: "Native connection via secure SSL connection string and read-only credentials.",
      isLive: true,
    },
    {
      name: "Salesforce CRM Pipeline Sync",
      status: "ENTERPRISE_PENDING",
      type: "CRM",
      description: "OAuth2 pipeline sync for deals, accounts, and opportunities. (Requires Enterprise Add-on)",
      isLive: false,
    },
    {
      name: "Snowflake Cloud Data Warehouse",
      status: "ENTERPRISE_PENDING",
      type: "DATA_WAREHOUSE",
      description: "Direct SQL query execution against Snowflake warehouse schemas. (Requires Enterprise Add-on)",
      isLive: false,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Integrations & Connectors</h1>
        <p className="text-xs text-slate-400 mt-1">
          Architected connector interfaces for business warehouses, CRM pipelines, and flat files.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {connectors.map((c) => (
          <div key={c.name} className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{c.name}</h3>
                  <span className="text-[10px] text-slate-400 font-semibold">{c.type}</span>
                </div>
              </div>

              {c.isLive ? (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                  Active & Ready
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold border border-slate-700/50 flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Config Interface
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300">{c.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

