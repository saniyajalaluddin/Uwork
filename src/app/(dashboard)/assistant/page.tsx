"use client";

import React, { useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Database,
} from "lucide-react";

interface Message {
  sender: "user" | "assistant";
  text: string;
  domain?: string;
  groundedMetrics?: Record<string, any>;
  confidence?: number;
  sources?: string[];
}

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "assistant",
      text: "Hello Sarah. I am UWORK's Grounded Business Assistant. I am directly connected to your active database and verified forecasting models. Ask me about revenue variances, product growth trajectories, churn risks, or future projections.",
      domain: "SYSTEM",
      confidence: 1.0,
      sources: ["UWORK Business Intelligence Database"],
    },
  ]);
  const [loading, setLoading] = useState(false);

  const quickPrompts = [
    "What is our Business Health Score and executive outlook?",
    "Why did revenue spike or drop in recent months?",
    "Which product is expanding fastest and has highest margin?",
    "Show me customers at risk and churn indicators",
    "What is our expected revenue next quarter?",
  ];

  const handleSend = async (queryText?: string) => {
    const q = queryText || input;
    if (!q.trim() || loading) return;

    const userMsg: Message = { sender: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            text: data.data.answer,
            domain: data.data.domain,
            groundedMetrics: data.data.groundedMetrics,
            confidence: data.data.confidenceScore,
            sources: data.data.sources,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            text: "I encountered an error retrieving verified metrics. Please try again.",
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: "Communication error connecting to the business intelligence service.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">AI Business Assistant</h1>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
              Deterministic Tool-Grounded
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Queries your organization's actual database and verified analytics. Never invents numbers.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          <span>Tenant Scoped & Guarded</span>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Suggested Analytical Queries:
        </span>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="space-y-4 min-h-[400px]">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              m.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-2xl p-4 rounded-xl text-xs leading-relaxed space-y-2.5 ${
                m.sender === "user"
                  ? "bg-blue-600 text-white font-medium"
                  : "bg-slate-900/90 border border-slate-800 text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-bold flex items-center gap-1.5">
                  {m.sender === "user" ? "You" : <><Bot className="h-3.5 w-3.5 text-blue-400" /> UWORK Intelligence Agent</>}
                </span>
                {m.domain && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                    {m.domain}
                  </span>
                )}
              </div>

              <p className="text-slate-100">{m.text}</p>

              {/* Grounded Metrics Card if present */}
              {m.groundedMetrics && (
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1 text-[11px]">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">
                    Verified Grounded Metrics:
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300">
                    {Object.entries(m.groundedMetrics).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-400">{k}:</span>{" "}
                        <strong className="text-white">
                          {typeof v === "number" ? v.toLocaleString() : String(v)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Citations */}
              {m.sources && (
                <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 border-t border-slate-800/60">
                  <Database className="h-3 w-3 text-blue-400" />
                  <span>Sources: {m.sources.join(", ")}</span>
                  {m.confidence && (
                    <span className="text-emerald-400 ml-auto font-semibold">
                      {(m.confidence * 100).toFixed(0)}% Confidence
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 w-fit">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
            <span>Querying verified database records and models...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="sticky bottom-4 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about revenue trends, forecasts, top products, or customers at risk..."
            className="flex-1 bg-transparent px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 shadow-lg shadow-blue-600/20"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

