export interface IntelligenceCardData {
  title: string;
  metricValue: string;
  deltaText: string;
  isPositive: boolean;
  whatHappened: string;
  why: string;
  whatNext: string;
  action: string;
}

export function generateIntelligenceLayer(
  revenueTotal: number,
  revenueGrowthPct: number,
  topProduct: string,
  topRegion: string,
  forecastProjectedRevenue: number,
  criticalAnomalyCount: number
): IntelligenceCardData[] {
  const formattedRev = `$${(revenueTotal / 1000000).toFixed(1)}M`;
  const formattedForecast = `$${(forecastProjectedRevenue / 1000000).toFixed(1)}M`;
  const growthFormatted = `${revenueGrowthPct >= 0 ? "+" : ""}${revenueGrowthPct.toFixed(1)}%`;

  return [
    {
      title: "Revenue & Growth Momentum",
      metricValue: formattedRev,
      deltaText: `${growthFormatted} period-over-period`,
      isPositive: revenueGrowthPct >= 0,
      whatHappened: `Total revenue reached ${formattedRev}, expanding ${growthFormatted} compared to the prior period.`,
      why: `Primary expansion was driven by outperformance in '${topProduct}' and higher contract density in '${topRegion}'.`,
      whatNext: `Forecasting model projects revenue pacing towards ${formattedForecast} over the next quarter with 95% confidence bounds.`,
      action: `Maintain sales capacity focused on '${topProduct}' and review inventory allocation to avoid supply bottlenecks.`,
    },
    {
      title: "Operational & Anomaly Health",
      metricValue: `${criticalAnomalyCount} Flagged`,
      deltaText: criticalAnomalyCount === 0 ? "Normal Baseline" : "Investigation Required",
      isPositive: criticalAnomalyCount === 0,
      whatHappened:
        criticalAnomalyCount === 0
          ? "No critical variance breaches detected in the latest audit cycle."
          : `${criticalAnomalyCount} operational variance outlier breached statistical bounds (>2.5 IQR).`,
      why:
        criticalAnomalyCount === 0
          ? "All product lines operated within standard variance envelopes."
          : `Variance concentration was detected during mid-quarter license closings and server provisioning adjustments.`,
      whatNext: "Continuous anomaly monitor will re-evaluate incoming transactions against the rolling 30-day baseline.",
      action:
        criticalAnomalyCount === 0
          ? "Maintain standard operational monitoring."
          : "Review the Anomaly Engine details and acknowledge root-cause attribution notes.",
    },
  ];
}

