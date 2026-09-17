"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Layers, AlertCircle, Lightbulb, Compass, ArrowRight } from "lucide-react";

interface SearchResult {
  title: string;
  category: string;
  url: string;
  description: string;
}

export default function GlobalSearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setResults(data.data.results || []);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (url: string) => {
    onClose();
    router.push(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 gap-3">
          <Search className="h-5 w-5 text-blue-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dashboards, metrics, forecasts, datasets, decisions..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-400"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-white transition p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-3 space-y-1.5 flex-1">
          {loading && (
            <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
              <span>Searching enterprise intelligence...</span>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching intelligence, metrics, or navigation items found for "{query}".
            </div>
          )}

          {!loading && !query && (
            <div className="p-4 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Navigation Shortcuts:
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Executive Overview", url: "/overview" },
                  { label: "Forecasting Engine", url: "/forecasting" },
                  { label: "Data Hub & Profiler", url: "/data-hub" },
                  { label: "AI Business Assistant", url: "/assistant" },
                  { label: "Decision Center", url: "/insights" },
                  { label: "Anomaly Engine", url: "/anomalies" },
                ].map((s) => (
                  <button
                    key={s.url}
                    onClick={() => handleSelect(s.url)}
                    className="p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 text-left text-xs text-slate-300 hover:text-white transition flex items-center justify-between"
                  >
                    <span>{s.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.map((r, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(r.url)}
              className="p-3 rounded-lg hover:bg-slate-800/80 cursor-pointer border border-transparent hover:border-slate-700/60 transition flex items-start justify-between gap-3 group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white group-hover:text-blue-400 transition">
                    {r.title}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                    {r.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{r.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-white transition shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

