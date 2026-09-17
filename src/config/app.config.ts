/**
 * UWORK Enterprise Platform Configuration & System Constants
 * 
 * Centralizes all magic numbers, timeouts, limits, security thresholds,
 * and system metadata with environment variable override capabilities.
 */

export const AppConfig = {
  // System Metadata & Packaging
  system: {
    name: "UWORK — Enterprise Business Intelligence & Forecasting Platform",
    shortName: "UWORK",
    serviceName: "UWORK Business Intelligence & Forecasting Engine",
    version: process.env.APP_VERSION || "1.0.0",
    description: "Enterprise BI, Walk-Forward Forecasting, and Automated Decision Intelligence",
    environment: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    supportEmail: process.env.SUPPORT_EMAIL || "support@uwork-enterprise.com",
  },

  // Security & Authentication Policy
  auth: {
    sessionExpiryDays: parseInt(process.env.SESSION_EXPIRY_DAYS || "7", 10),
    sessionCookieName: "uwork_session",
    maxFailedLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || "5", 10),
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || "15", 10),
    lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MINUTES || "15", 10) * 60 * 1000,
    bcryptSaltRounds: 12,
    passwordMinLength: 8,
    apiKeyPrefix: "uw_live_",
  },

  // Storage & Dataset Upload Boundaries
  storage: {
    maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || String(50 * 1024 * 1024), 10), // 50 MB
    maxUploadSizeMB: 50,
    allowedExtensions: [".csv", ".xlsx", ".xls"] as const,
    allowedMimeTypes: [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ] as const,
    uploadsDir: "storage/uploads",
    reportsDir: "storage/reports",
  },

  // Machine Learning & Time-Series Forecasting
  forecasting: {
    defaultHorizonPeriods: parseInt(process.env.DEFAULT_FORECAST_HORIZON || "6", 10),
    minHorizonPeriods: 1,
    maxHorizonPeriods: 24,
    defaultConfidenceLevel: 0.95,
    secondaryConfidenceLevel: 0.80,
    defaultFrequency: "MONTHLY",
    minHistoryLength: 6,
    validationHoldoutRatio: 0.25, // 25% out-of-time evaluation split
    ridgeRegularizationLambda: 1e-4,
    candidateModels: [
      "HOLT_WINTERS",
      "ARIMA_OLS",
      "OLS_LINEAR_TREND",
      "DYNAMIC_ENSEMBLE",
    ] as const,
  },

  // Anomaly Detection Engine
  anomalies: {
    defaultWindowSize: 5,
    minWindowSize: 3,
    zScoreThreshold: 2.3,
    madConsistencyMultiplier: 1.4826,
    hampelThreshold: 3.0,
    iqrMultiplier: 1.5,
    severity: {
      criticalDeviationPct: 150,
      criticalZScore: 3.5,
      highDeviationPct: 60,
      highZScore: 2.8,
      mediumDeviationPct: 25,
      mediumZScore: 2.2,
    },
  },

  // Background Job Queue & Distributed Workers
  jobs: {
    defaultMaxAttempts: parseInt(process.env.JOB_MAX_ATTEMPTS || "3", 10),
    staleLockThresholdMinutes: 5,
    staleLockThresholdMs: 5 * 60 * 1000,
    pollIntervalMs: 1000,
    supportedJobTypes: [
      "FILE_INGESTION",
      "DATA_PROFILING",
      "FORECAST_RUN",
      "REPORT_EXPORT",
      "DATA_CLEANING",
    ] as const,
  },

  // In-Memory Caching & Performance
  cache: {
    analyticsTtlMs: parseInt(process.env.ANALYTICS_CACHE_TTL_MS || String(60 * 1000), 10), // 60s
    rateLimiterMaxEntries: 10000,
    rateLimiterPruneIntervalMs: 60 * 60 * 1000, // 1h
  },

  // Rate Limiting Policies
  rateLimits: {
    authLogin: { limit: 5, windowMs: 60 * 1000 },
    authRegister: { limit: 5, windowMs: 60 * 60 * 1000 },
    passwordChange: { limit: 5, windowMs: 60 * 60 * 1000 },
    datasetUpload: { limit: 15, windowMs: 60 * 60 * 1000 },
    forecastGenerate: { limit: 15, windowMs: 60 * 60 * 1000 },
    assistantChat: { limit: 25, windowMs: 60 * 60 * 1000 },
    reportExport: { limit: 20, windowMs: 60 * 60 * 1000 },
    generalApi: { limit: 120, windowMs: 60 * 1000 },
  },

  // Enterprise Quotas & Plan Tier Defaults
  quotas: {
    enterprise: {
      planTier: "ENTERPRISE",
      planName: "Enterprise Business Intelligence & AI Suite",
      maxRows: 10000000,
      maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
      maxStorageFormatted: "100 GB",
      maxTeamSeats: 50,
      computeNodesAllocated: 8,
      slaAvailability: "99.99% Guaranteed Availability",
      auditRetention: "7 Years Tamper-Evident Storage",
    },
  },
} as const;

export type AppConfigType = typeof AppConfig;

