export interface BusinessMetricsSummary {
  revenueGrowthMoM: number; // e.g. 14.5 (%)
  grossMarginPct: number; // e.g. 68.2 (%)
  netRevenueRetention: number; // e.g. 94.0 (%)
  forecastMape: number; // e.g. 5.2 (%)
  criticalAnomaliesCount: number; // e.g. 1
  orderGrowthMoM: number; // e.g. 11.0 (%)
}

export type IndustrySector =
  | "B2B_SAAS"
  | "ECOMMERCE"
  | "MANUFACTURING"
  | "PROFESSIONAL_SERVICES"
  | "RETAIL"
  | "FINTECH"
  | "CUSTOM";

export interface HealthScoreWeights {
  revenue: number;
  profit: number;
  retention: number;
  growth: number;
  stability: number;
}

export interface SectorBenchmark {
  sector: IndustrySector;
  displayName: string;
  targetGrossMarginPct: number;
  minGrossMarginPct: number;
  targetRevenueGrowthMoM: number;
  targetNetRetentionPct: number;
  maxAcceptableForecastMape: number;
  defaultWeights: HealthScoreWeights;
}

export const SECTOR_BENCHMARKS: Record<IndustrySector, SectorBenchmark> = {
  B2B_SAAS: {
    sector: "B2B_SAAS",
    displayName: "B2B Enterprise SaaS",
    targetGrossMarginPct: 75,
    minGrossMarginPct: 45,
    targetRevenueGrowthMoM: 6.0,
    targetNetRetentionPct: 105,
    maxAcceptableForecastMape: 10,
    defaultWeights: {
      revenue: 0.25,
      profit: 0.20,
      retention: 0.25,
      growth: 0.15,
      stability: 0.15,
    },
  },
  ECOMMERCE: {
    sector: "ECOMMERCE",
    displayName: "E-Commerce & D2C Brands",
    targetGrossMarginPct: 40,
    minGrossMarginPct: 18,
    targetRevenueGrowthMoM: 5.0,
    targetNetRetentionPct: 70,
    maxAcceptableForecastMape: 14,
    defaultWeights: {
      revenue: 0.30,
      profit: 0.25,
      retention: 0.15,
      growth: 0.20,
      stability: 0.10,
    },
  },
  MANUFACTURING: {
    sector: "MANUFACTURING",
    displayName: "Industrial & Discrete Manufacturing",
    targetGrossMarginPct: 30,
    minGrossMarginPct: 12,
    targetRevenueGrowthMoM: 2.5,
    targetNetRetentionPct: 90,
    maxAcceptableForecastMape: 8,
    defaultWeights: {
      revenue: 0.15,
      profit: 0.35,
      retention: 0.15,
      growth: 0.10,
      stability: 0.25,
    },
  },
  PROFESSIONAL_SERVICES: {
    sector: "PROFESSIONAL_SERVICES",
    displayName: "Professional & Agency Services",
    targetGrossMarginPct: 50,
    minGrossMarginPct: 25,
    targetRevenueGrowthMoM: 3.5,
    targetNetRetentionPct: 95,
    maxAcceptableForecastMape: 12,
    defaultWeights: {
      revenue: 0.20,
      profit: 0.30,
      retention: 0.25,
      growth: 0.10,
      stability: 0.15,
    },
  },
  RETAIL: {
    sector: "RETAIL",
    displayName: "Omnichannel & Retail",
    targetGrossMarginPct: 35,
    minGrossMarginPct: 15,
    targetRevenueGrowthMoM: 3.0,
    targetNetRetentionPct: 65,
    maxAcceptableForecastMape: 10,
    defaultWeights: {
      revenue: 0.25,
      profit: 0.30,
      retention: 0.15,
      growth: 0.15,
      stability: 0.15,
    },
  },
  FINTECH: {
    sector: "FINTECH",
    displayName: "Financial Technology & Payments",
    targetGrossMarginPct: 65,
    minGrossMarginPct: 35,
    targetRevenueGrowthMoM: 7.0,
    targetNetRetentionPct: 110,
    maxAcceptableForecastMape: 8,
    defaultWeights: {
      revenue: 0.25,
      profit: 0.20,
      retention: 0.25,
      growth: 0.15,
      stability: 0.15,
    },
  },
  CUSTOM: {
    sector: "CUSTOM",
    displayName: "Custom Organization Benchmark",
    targetGrossMarginPct: 60,
    minGrossMarginPct: 30,
    targetRevenueGrowthMoM: 5.0,
    targetNetRetentionPct: 100,
    maxAcceptableForecastMape: 10,
    defaultWeights: {
      revenue: 0.25,
      profit: 0.20,
      retention: 0.20,
      growth: 0.20,
      stability: 0.15,
    },
  },
};

export interface CalculatedHealthScore {
  overallScore: number;
  revenueScore: number;
  profitScore: number;
  retentionScore: number;
  growthScore: number;
  stabilityScore: number;
  sector: IndustrySector;
  weights: HealthScoreWeights;
  rationale: string[];
}

export interface HealthScoreOptions {
  sector?: IndustrySector;
  customBenchmark?: Partial<SectorBenchmark>;
  customWeights?: Partial<HealthScoreWeights>;
}

/**
 * Computes a deterministic, multi-dimensional business health score (0-100)
 * calibrated against industry sector benchmarks with customizable pillar weights.
 */
export function computeBusinessHealthScore(
  metrics: BusinessMetricsSummary,
  options?: HealthScoreOptions
): CalculatedHealthScore {
  const selectedSector = options?.sector || "B2B_SAAS";
  const baseBenchmark = SECTOR_BENCHMARKS[selectedSector] || SECTOR_BENCHMARKS.B2B_SAAS;

  const benchmark: SectorBenchmark = {
    ...baseBenchmark,
    ...(options?.customBenchmark || {}),
  };

  // 1. Revenue Velocity Score (0-100)
  const targetGrowth = benchmark.targetRevenueGrowthMoM;
  let revenueScore: number;
  if (metrics.revenueGrowthMoM >= targetGrowth) {
    const bonus = Math.min(20, ((metrics.revenueGrowthMoM - targetGrowth) / Math.max(1, targetGrowth)) * 15);
    revenueScore = 80 + bonus;
  } else if (metrics.revenueGrowthMoM >= 0) {
    revenueScore = 50 + (metrics.revenueGrowthMoM / Math.max(0.1, targetGrowth)) * 30;
  } else {
    revenueScore = Math.max(10, 50 - Math.abs(metrics.revenueGrowthMoM) * 2.5);
  }

  // 2. Profitability Score (0-100) scaled against sector margins
  const targetMargin = benchmark.targetGrossMarginPct;
  const minMargin = benchmark.minGrossMarginPct;
  let profitScore: number;
  if (metrics.grossMarginPct >= targetMargin) {
    const bonus = Math.min(15, ((metrics.grossMarginPct - targetMargin) / Math.max(1, 100 - targetMargin)) * 15);
    profitScore = 85 + bonus;
  } else if (metrics.grossMarginPct >= minMargin) {
    const ratio = (metrics.grossMarginPct - minMargin) / Math.max(1, targetMargin - minMargin);
    profitScore = 40 + ratio * 45;
  } else {
    const shortfall = minMargin - metrics.grossMarginPct;
    profitScore = Math.max(5, 40 - shortfall * 2.5);
  }

  // 3. Customer Retention Score (0-100)
  const targetRetention = benchmark.targetNetRetentionPct;
  let retentionScore: number;
  if (metrics.netRevenueRetention >= targetRetention) {
    const bonus = Math.min(15, ((metrics.netRevenueRetention - targetRetention) / Math.max(1, targetRetention)) * 50);
    retentionScore = 85 + bonus;
  } else if (metrics.netRevenueRetention >= targetRetention * 0.7) {
    const ratio = (metrics.netRevenueRetention - targetRetention * 0.7) / Math.max(1, targetRetention * 0.3);
    retentionScore = 40 + ratio * 45;
  } else {
    retentionScore = Math.max(10, (metrics.netRevenueRetention / Math.max(1, targetRetention * 0.7)) * 40);
  }

  // 4. Growth Velocity Score (0-100)
  let growthScore: number;
  if (metrics.orderGrowthMoM >= targetGrowth) {
    const bonus = Math.min(20, ((metrics.orderGrowthMoM - targetGrowth) / Math.max(1, targetGrowth)) * 15);
    growthScore = 80 + bonus;
  } else if (metrics.orderGrowthMoM >= 0) {
    growthScore = 50 + (metrics.orderGrowthMoM / Math.max(0.1, targetGrowth)) * 30;
  } else {
    growthScore = Math.max(10, 50 - Math.abs(metrics.orderGrowthMoM) * 2.5);
  }

  // 5. Predictability & Stability Score (0-100)
  const maxMape = benchmark.maxAcceptableForecastMape;
  const mapePenalty = Math.min(40, (metrics.forecastMape / Math.max(1, maxMape)) * 20);
  const anomalyPenalty = Math.min(45, metrics.criticalAnomaliesCount * 12);
  const stabilityScore = Math.max(10, 100 - mapePenalty - anomalyPenalty);

  // Normalize Pillar Weights
  const rawWeights: HealthScoreWeights = {
    revenue: options?.customWeights?.revenue ?? benchmark.defaultWeights.revenue,
    profit: options?.customWeights?.profit ?? benchmark.defaultWeights.profit,
    retention: options?.customWeights?.retention ?? benchmark.defaultWeights.retention,
    growth: options?.customWeights?.growth ?? benchmark.defaultWeights.growth,
    stability: options?.customWeights?.stability ?? benchmark.defaultWeights.stability,
  };

  const totalWeight =
    rawWeights.revenue +
    rawWeights.profit +
    rawWeights.retention +
    rawWeights.growth +
    rawWeights.stability || 1.0;

  const weights: HealthScoreWeights = {
    revenue: Math.round((rawWeights.revenue / totalWeight) * 1000) / 1000,
    profit: Math.round((rawWeights.profit / totalWeight) * 1000) / 1000,
    retention: Math.round((rawWeights.retention / totalWeight) * 1000) / 1000,
    growth: Math.round((rawWeights.growth / totalWeight) * 1000) / 1000,
    stability: Math.round((rawWeights.stability / totalWeight) * 1000) / 1000,
  };

  const overallScore = Math.round(
    revenueScore * weights.revenue +
      profitScore * weights.profit +
      retentionScore * weights.retention +
      growthScore * weights.growth +
      stabilityScore * weights.stability
  );

  const rationale: string[] = [];
  rationale.push(`Calibrated against ${benchmark.displayName} benchmark.`);

  if (metrics.revenueGrowthMoM >= targetGrowth) {
    rationale.push(
      `Revenue expansion (+${metrics.revenueGrowthMoM.toFixed(1)}% MoM) outperforms the ${targetGrowth}% sector benchmark.`
    );
  } else if (metrics.revenueGrowthMoM > 0) {
    rationale.push(
      `Revenue is expanding at +${metrics.revenueGrowthMoM.toFixed(1)}% MoM (sector target: ${targetGrowth}%).`
    );
  } else {
    rationale.push(
      `Revenue contracted ${Math.abs(metrics.revenueGrowthMoM).toFixed(1)}% MoM in the current period.`
    );
  }

  if (metrics.grossMarginPct >= targetMargin) {
    rationale.push(
      `Gross margin remains robust at ${metrics.grossMarginPct.toFixed(1)}% (benchmark: ${targetMargin}%).`
    );
  } else {
    rationale.push(
      `Gross margin at ${metrics.grossMarginPct.toFixed(1)}% trails the sector benchmark of ${targetMargin}%.`
    );
  }

  if (metrics.criticalAnomaliesCount > 0) {
    rationale.push(
      `${metrics.criticalAnomaliesCount} critical statistical anomaly requires operational attention.`
    );
  } else {
    rationale.push("Zero critical operational anomalies detected.");
  }

  return {
    overallScore,
    revenueScore: Math.round(revenueScore),
    profitScore: Math.round(profitScore),
    retentionScore: Math.round(retentionScore),
    growthScore: Math.round(growthScore),
    stabilityScore: Math.round(stabilityScore),
    sector: selectedSector,
    weights,
    rationale,
  };
}
