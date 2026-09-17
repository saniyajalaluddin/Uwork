const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding UWORK Business Intelligence Platform database...");

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.decisionItem.deleteMany();
  await prisma.businessHealthScore.deleteMany();
  await prisma.insight.deleteMany();
  await prisma.anomaly.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.forecastModel.deleteMany();
  await prisma.forecastRun.deleteMany();
  await prisma.forecast.deleteMany();
  await prisma.dashboardWidget.deleteMany();
  await prisma.dashboard.deleteMany();
  await prisma.metric.deleteMany();
  await prisma.dataValidationResult.deleteMany();
  await prisma.datasetColumn.deleteMany();
  await prisma.datasetVersion.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // Hash password
  const passwordHash = await bcrypt.hash("Password123!", 10);

  // 1. Create Users
  const ownerUser = await prisma.user.create({
    data: {
      email: "admin@apex.com",
      passwordHash,
      firstName: "Sarah",
      lastName: "Chen",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const analystUser = await prisma.user.create({
    data: {
      email: "analyst@apex.com",
      passwordHash,
      firstName: "Marcus",
      lastName: "Vance",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  const viewerUser = await prisma.user.create({
    data: {
      email: "viewer@apex.com",
      passwordHash,
      firstName: "Elena",
      lastName: "Rostova",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: "Apex Global Technologies",
      slug: "apex-global",
      planTier: "ENTERPRISE",
    },
  });

  // 3. Create Memberships
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: ownerUser.id, role: "OWNER" },
      { organizationId: org.id, userId: analystUser.id, role: "ANALYST" },
      { organizationId: org.id, userId: viewerUser.id, role: "VIEWER" },
    ],
  });

  // 4. Create Sample Dataset
  const dataset = await prisma.dataset.create({
    data: {
      organizationId: org.id,
      name: "2024-2026 Enterprise Revenue & Sales Stream",
      description: "Omni-channel sales transactions across Cloud Solutions, Enterprise SaaS, and AI Infrastructure.",
      sourceType: "CSV",
      createdById: analystUser.id,
    },
  });

  const datasetVersion = await prisma.datasetVersion.create({
    data: {
      datasetId: dataset.id,
      versionNumber: 1,
      storagePath: "storage/uploads/apex-revenue-stream.csv",
      fileName: "apex-revenue-stream.csv",
      fileSizeBytes: 1048576,
      mimeType: "text/csv",
      rowCount: 24890,
      columnCount: 8,
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "READY",
    },
  });

  await prisma.dataset.update({
    where: { id: dataset.id },
    data: { currentVersionId: datasetVersion.id },
  });

  // 5. Create Dataset Columns
  const columnsData = [
    { name: "Date", originalName: "Transaction_Date", dataType: "DATE", inferredBusinessRole: "DATE_TIME", nullCount: 0, uniqueCount: 730 },
    { name: "Revenue", originalName: "Net_Revenue", dataType: "NUMERIC", inferredBusinessRole: "REVENUE", nullCount: 5, uniqueCount: 18400 },
    { name: "Cost", originalName: "COGS", dataType: "NUMERIC", inferredBusinessRole: "COST", nullCount: 12, uniqueCount: 14200 },
    { name: "Units", originalName: "Quantity_Sold", dataType: "NUMERIC", inferredBusinessRole: "SALES_VOLUME", nullCount: 0, uniqueCount: 350 },
    { name: "Product", originalName: "Product_Line", dataType: "CATEGORICAL", inferredBusinessRole: "PRODUCT_ID", nullCount: 0, uniqueCount: 5 },
    { name: "Region", originalName: "Sales_Territory", dataType: "CATEGORICAL", inferredBusinessRole: "REGION", nullCount: 0, uniqueCount: 4 },
    { name: "Customer", originalName: "Client_Account", dataType: "CATEGORICAL", inferredBusinessRole: "CUSTOMER_ID", nullCount: 18, uniqueCount: 1420 },
    { name: "Channel", originalName: "Distribution_Channel", dataType: "CATEGORICAL", inferredBusinessRole: "GENERIC_DIMENSION", nullCount: 0, uniqueCount: 3 },
  ];

  for (let i = 0; i < columnsData.length; i++) {
    const col = columnsData[i];
    await prisma.datasetColumn.create({
      data: {
        datasetVersionId: datasetVersion.id,
        columnIndex: i,
        name: col.name,
        originalName: col.originalName,
        dataType: col.dataType,
        inferredBusinessRole: col.inferredBusinessRole,
        nullCount: col.nullCount,
        uniqueCount: col.uniqueCount,
        sampleValuesJson: JSON.stringify(["Sample Val 1", "Sample Val 2"]),
        summaryStatsJson: JSON.stringify({ min: 100, max: 85000, mean: 4520, std: 1840 }),
      },
    });
  }

  // 6. Data Validation Result
  await prisma.dataValidationResult.create({
    data: {
      datasetVersionId: datasetVersion.id,
      qualityScore: 96.4,
      passed: true,
      totalRulesEvaluated: 14,
      summaryJson: JSON.stringify({
        totalRows: 24890,
        validRows: 24855,
        missingValues: 35,
        duplicateRows: 0,
        outliersDetected: 18,
      }),
      issuesJson: JSON.stringify([
        { code: "NULL_REVENUE", column: "Revenue", severity: "LOW", message: "5 records missing revenue values (0.02%)" },
        { code: "NULL_CUSTOMER", column: "Customer", severity: "LOW", message: "18 records without customer identifier (0.07%)" },
        { code: "PRICE_SPIKE_OUTLIER", column: "Revenue", severity: "MEDIUM", message: "18 transactions exceeded 3.5 IQR threshold in Q3" },
      ]),
    },
  });

  // 7. Core Metrics
  const revenueMetric = await prisma.metric.create({
    data: {
      organizationId: org.id,
      datasetVersionId: datasetVersion.id,
      name: "Gross Revenue",
      code: "TOTAL_REVENUE",
      aggregationType: "SUM",
      timeGranularity: "MONTHLY",
      targetValue: 28500000,
    },
  });

  const profitMetric = await prisma.metric.create({
    data: {
      organizationId: org.id,
      datasetVersionId: datasetVersion.id,
      name: "Gross Profit Margin",
      code: "MARGIN",
      aggregationType: "AVG",
      timeGranularity: "MONTHLY",
      targetValue: 68.5,
    },
  });

  // 8. Forecast & Prediction Runs
  const forecast = await prisma.forecast.create({
    data: {
      organizationId: org.id,
      datasetVersionId: datasetVersion.id,
      name: "H2 2026 Revenue Projection",
      targetColumnName: "Revenue",
      dateColumnName: "Date",
      frequency: "MONTHLY",
      horizonPeriods: 6,
      confidenceLevel: 0.95,
      status: "READY",
    },
  });

  const forecastRun = await prisma.forecastRun.create({
    data: {
      forecastId: forecast.id,
      runNumber: 1,
      status: "COMPLETED",
      selectedModelName: "Holt-Winters Triple Exponential Smoothing",
      metricsJson: JSON.stringify({
        mae: 142500,
        rmse: 184300,
        mape: 5.2,
        sMape: 4.9,
        r2: 0.941,
      }),
      candidateScoresJson: JSON.stringify([
        { model: "Holt-Winters (Additive Seasonality)", mape: 5.2, rmse: 184300, rank: 1 },
        { model: "Auto-ARIMA (1, 1, 1)(1, 0, 1)12", mape: 6.8, rmse: 212400, rank: 2 },
        { model: "Random Forest Regressor (Lags 1-12)", mape: 7.4, rmse: 245000, rank: 3 },
        { model: "Rolling Linear Trend Drift", mape: 11.3, rmse: 380100, rank: 4 },
      ]),
      driversJson: JSON.stringify({
        trendSlope: "+6.8% MoM baseline expansion",
        seasonalityStrength: "High (Q4 recurring spike factor 1.34x)",
        primaryDrivers: [
          { factor: "Enterprise Cloud Suite adoption", contribution: "48%" },
          { factor: "North America regional expansion", contribution: "28%" },
          { factor: "Contract renewals & retention", contribution: "16%" },
        ],
      }),
      completedAt: new Date(),
    },
  });

  // Historical & Projected Points
  const monthlyTimeline = [
    { date: "2025-07-01", actual: 2150000, pred: 2120000, low: 2020000, up: 2220000, isForecast: false },
    { date: "2025-08-01", actual: 2280000, pred: 2250000, low: 2140000, up: 2360000, isForecast: false },
    { date: "2025-09-01", actual: 2410000, pred: 2390000, low: 2280000, up: 2500000, isForecast: false },
    { date: "2025-10-01", actual: 2590000, pred: 2550000, low: 2430000, up: 2670000, isForecast: false },
    { date: "2025-11-01", actual: 2780000, pred: 2740000, low: 2610000, up: 2870000, isForecast: false },
    { date: "2025-12-01", actual: 3250000, pred: 3190000, low: 3040000, up: 3340000, isForecast: false },
    { date: "2026-01-01", actual: 2620000, pred: 2650000, low: 2510000, up: 2790000, isForecast: false },
    { date: "2026-02-01", actual: 2740000, pred: 2710000, low: 2570000, up: 2850000, isForecast: false },
    { date: "2026-03-01", actual: 2980000, pred: 2940000, low: 2790000, up: 3090000, isForecast: false },
    { date: "2026-04-01", actual: 3120000, pred: 3090000, low: 2930000, up: 3250000, isForecast: false },
    { date: "2026-05-01", actual: 3290000, pred: 3260000, low: 3090000, up: 3430000, isForecast: false },
    { date: "2026-06-01", actual: 3450000, pred: 3420000, low: 3240000, up: 3600000, isForecast: false },
    // Forecast Horizon (next 6 months)
    { date: "2026-07-01", actual: null, pred: 3620000, low: 3390000, up: 3850000, isForecast: true },
    { date: "2026-08-01", actual: null, pred: 3790000, low: 3510000, up: 4070000, isForecast: true },
    { date: "2026-09-01", actual: null, pred: 3980000, low: 3660000, up: 4300000, isForecast: true },
    { date: "2026-10-01", actual: null, pred: 4210000, low: 3840000, up: 4580000, isForecast: true },
    { date: "2026-11-01", actual: null, pred: 4560000, low: 4120000, up: 5000000, isForecast: true },
    { date: "2026-12-01", actual: null, pred: 5120000, low: 4580000, up: 5660000, isForecast: true },
  ];

  for (const pt of monthlyTimeline) {
    await prisma.prediction.create({
      data: {
        forecastRunId: forecastRun.id,
        timestamp: pt.date,
        actualValue: pt.actual,
        predictedValue: pt.pred,
        confidenceLower: pt.low,
        confidenceUpper: pt.up,
        isForecast: pt.isForecast,
      },
    });
  }

  // 9. Anomalies
  await prisma.anomaly.createMany({
    data: [
      {
        organizationId: org.id,
        datasetVersionId: datasetVersion.id,
        metricName: "Revenue",
        timestamp: "2026-03-18",
        observedValue: 485000,
        expectedValue: 125000,
        deviationPct: 288.0,
        severity: "CRITICAL",
        detectionMethod: "SEASONAL_RESIDUAL",
        rootCauseJson: JSON.stringify({
          factor: "Sudden enterprise multi-year license closing",
          segment: "Enterprise Cloud Suite - North America",
          confidenceScore: 0.94,
        }),
      },
      {
        organizationId: org.id,
        datasetVersionId: datasetVersion.id,
        metricName: "Gross Margin",
        timestamp: "2026-05-04",
        observedValue: 51.2,
        expectedValue: 69.5,
        deviationPct: -26.3,
        severity: "HIGH",
        detectionMethod: "ROLLING_ZSCORE",
        rootCauseJson: JSON.stringify({
          factor: "Surge in cloud GPU server provisioning expenses",
          segment: "AI Infrastructure - Europe Tier 1",
          confidenceScore: 0.88,
        }),
      },
    ],
  });

  // 10. Business Health Score
  await prisma.businessHealthScore.create({
    data: {
      organizationId: org.id,
      datasetVersionId: datasetVersion.id,
      overallScore: 88.5,
      revenueScore: 92.0,
      profitScore: 84.5,
      retentionScore: 89.0,
      growthScore: 94.0,
      stabilityScore: 83.0,
      weightsJson: JSON.stringify({
        revenue: 0.25,
        profit: 0.20,
        retention: 0.20,
        growth: 0.20,
        stability: 0.15,
      }),
      rationaleJson: JSON.stringify([
        "Revenue expansion (+14.8% YoY) consistently outpaces sector average.",
        "Retention remains stellar at 93.4% net revenue retention (NRR).",
        "European margins dipped in May due to temporary infrastructure scale-out.",
      ]),
    },
  });

  // 11. Decision Center Items
  await prisma.decisionItem.createMany({
    data: [
      {
        organizationId: org.id,
        title: "Rebalance Cloud Infrastructure in EU Central",
        priority: "HIGH",
        category: "PRICING",
        impactSummary: "Gross margin in Europe dropped by 18.3 percentage points due to unreserved compute instances.",
        evidenceJson: JSON.stringify({
          costSurge: "$142,000 above forecast",
          affectedService: "AI Model Serving Nodes",
          timeframe: "May 2026 - Present",
        }),
        recommendedAction: "Execute 1-year reserved compute commitment with provider to recover 35% margin immediately.",
        status: "OPEN",
      },
      {
        organizationId: org.id,
        title: "Scale Enterprise Sales Reps in North America",
        priority: "CRITICAL",
        category: "REVENUE",
        impactSummary: "Demand for Enterprise Cloud Suite is currently pacing 28% ahead of rep quota coverage.",
        evidenceJson: JSON.stringify({
          unmetInboundLeads: "48 Qualified Accounts",
          projectedRevenueLoss: "$1.8M ARR if delayed",
          winRate: "34.2% in NA",
        }),
        recommendedAction: "Reallocate 4 senior account executives from stagnant APAC territories to NA Tier-1 accounts.",
        status: "OPEN",
      },
      {
        organizationId: org.id,
        title: "Address Churn Risk in Mid-Market Healthcare Cohort",
        priority: "MEDIUM",
        category: "CUSTOMER",
        impactSummary: "Healthcare account usage frequency declined 24% over the trailing 60 days.",
        evidenceJson: JSON.stringify({
          accountsAtRisk: 14,
          contractValue: "$410,000 ARR",
          averageNPS: "6.2",
        }),
        recommendedAction: "Trigger executive check-ins and deploy dedicated customer success engineers to resolve data ingestion blockers.",
        status: "OPEN",
      },
    ],
  });

  // 12. Insights
  await prisma.insight.createMany({
    data: [
      {
        organizationId: org.id,
        datasetVersionId: datasetVersion.id,
        category: "GROWTH",
        title: "Enterprise Cloud Suite Drives 62% of Incremental Growth",
        observation: "Cloud Suite ARR grew 38.4% YoY while legacy licenses shrank 4.2%.",
        evidenceJson: JSON.stringify({ newArr: "$4.2M", totalArr: "$34.5M" }),
        impactMagnitude: 4.2,
        recommendedAction: "Transition remaining legacy on-prem customers to cloud contracts with renewal migration credits.",
      },
      {
        organizationId: org.id,
        datasetVersionId: datasetVersion.id,
        category: "CONCENTRATION",
        title: "Top 10 Accounts Account for 39% of Total Billing",
        observation: "Revenue concentration remains moderate but heightened in the financial services vertical.",
        evidenceJson: JSON.stringify({ top10Ratio: 0.39, vertical: "Fintech & Banking" }),
        impactMagnitude: 3.9,
        recommendedAction: "Enforce multi-threaded executive relationships across all top 10 enterprise accounts.",
      },
    ],
  });

  // 13. Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: ownerUser.id,
      action: "ORGANIZATION_INITIALIZED",
      resourceType: "ORGANIZATION",
      resourceId: org.id,
      ipAddress: "127.0.0.1",
      userAgent: "System Bootstrap / Seed",
      status: "SUCCESS",
      metadataJson: JSON.stringify({ initializedAt: new Date().toISOString(), plan: "ENTERPRISE" }),
    },
  });

  // 14. Notifications
  await prisma.notification.createMany({
    data: [
      {
        organizationId: org.id,
        userId: ownerUser.id,
        title: "H2 2026 Forecast Generated",
        message: "Holt-Winters model completed revenue projection with 95% confidence bounds (MAPE 5.2%).",
        type: "FORECAST_COMPLETED",
        linkUrl: "/forecasting",
      },
      {
        organizationId: org.id,
        userId: ownerUser.id,
        title: "Critical Anomaly Detected",
        message: "Unusual positive revenue spike detected on 2026-03-18 (+288% above baseline).",
        type: "ANOMALY_ALERT",
        linkUrl: "/anomalies",
      },
    ],
  });

  console.log("Seeding completed successfully!");
  console.log("Credentials:");
  console.log("  Owner:   admin@apex.com   / Password123!");
  console.log("  Analyst: analyst@apex.com / Password123!");
  console.log("  Viewer:  viewer@apex.com  / Password123!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

