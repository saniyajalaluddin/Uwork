/**
 * In-Memory Metrics & Telemetry Collector for High-Throughput BI Operations
 */

interface CounterEntry {
  value: number;
  labels?: Record<string, string>;
}

interface HistogramEntry {
  values: number[];
  labels?: Record<string, string>;
}

const counters = new Map<string, CounterEntry>();
const histograms = new Map<string, HistogramEntry>();
const gauges = new Map<string, number>();

function serializeKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const sortedPairs = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${sortedPairs}}`;
}

/**
 * Increments a monotonically increasing counter.
 */
export function incrementCounter(
  name: string,
  value = 1,
  labels?: Record<string, string>
): void {
  const key = serializeKey(name, labels);
  const existing = counters.get(key);
  if (existing) {
    existing.value += value;
  } else {
    counters.set(key, { value, labels });
  }
}

/**
 * Sets a real-time gauge value.
 */
export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>
): void {
  const key = serializeKey(name, labels);
  gauges.set(key, value);
}

/**
 * Records a latency or duration measurement in milliseconds.
 */
export function recordDuration(
  name: string,
  durationMs: number,
  labels?: Record<string, string>
): void {
  const key = serializeKey(name, labels);
  const existing = histograms.get(key);
  if (existing) {
    existing.values.push(durationMs);
    // Keep histogram sample bounded at 5,000 samples per metric
    if (existing.values.length > 5000) {
      existing.values.shift();
    }
  } else {
    histograms.set(key, { values: [durationMs], labels });
  }
}

export const recordHistogram = recordDuration;

export interface MetricHistogramStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Generates an aggregated snapshot of all recorded metrics.
 */
export function getMetricsSnapshot(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, MetricHistogramStats>;
} {
  const counterSnapshot: Record<string, number> = {};
  for (const [key, entry] of counters.entries()) {
    counterSnapshot[key] = entry.value;
  }

  const gaugeSnapshot: Record<string, number> = {};
  for (const [key, val] of gauges.entries()) {
    gaugeSnapshot[key] = val;
  }

  const histogramSnapshot: Record<string, MetricHistogramStats> = {};
  for (const [key, entry] of histograms.entries()) {
    const vals = [...entry.values].sort((a, b) => a - b);
    const count = vals.length;
    const sum = vals.reduce((acc, v) => acc + v, 0);
    histogramSnapshot[key] = {
      count,
      sum: Math.round(sum * 100) / 100,
      avg: count > 0 ? Math.round((sum / count) * 100) / 100 : 0,
      min: count > 0 ? vals[0] : 0,
      max: count > 0 ? vals[count - 1] : 0,
      p50: Math.round(calculatePercentile(vals, 50) * 100) / 100,
      p90: Math.round(calculatePercentile(vals, 90) * 100) / 100,
      p95: Math.round(calculatePercentile(vals, 95) * 100) / 100,
      p99: Math.round(calculatePercentile(vals, 99) * 100) / 100,
    };
  }

  return {
    counters: counterSnapshot,
    gauges: gaugeSnapshot,
    histograms: histogramSnapshot,
  };
}

/**
 * Resets all collected metrics (useful for testing or periodic flushes).
 */
export function clearMetrics(): void {
  counters.clear();
  histograms.clear();
  gauges.clear();
}

