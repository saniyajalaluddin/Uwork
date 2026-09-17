import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/db/prisma";
import { sanitizeSpreadsheetCell } from "../lib/security/sanitize";
import { deleteStorageFile } from "../lib/storage/storage";
import { eventBus } from "../lib/events/event-bus";
import {
  getOverviewData,
  getSalesAnalyticsData,
  getCustomerAnalyticsData,
  getProductAnalyticsData,
} from "./analytics.service";

const REPORTS_DIR = path.resolve(process.cwd(), "storage", "reports");

export type ReportType =
  | "EXECUTIVE_SUMMARY"
  | "SALES_DEEP_DIVE"
  | "FORECAST_PROJECTION"
  | "DATA_QUALITY";

export type ReportFormat = "CSV" | "JSON" | "HTML";

export interface GenerateReportOptions {
  organizationId: string;
  userId?: string;
  type?: ReportType;
  format?: ReportFormat;
  title?: string;
}

export interface GeneratedReportResult {
  reportId: string;
  storagePath: string;
  fileName: string;
  title: string;
  format: ReportFormat;
  type: ReportType;
}

// ----------------------------------------------------------------------
// 1. Core Multi-Format & Multi-Type Report Generation
// ----------------------------------------------------------------------

export async function generateReport(
  options: GenerateReportOptions
): Promise<GeneratedReportResult> {
  const {
    organizationId,
    userId,
    type = "EXECUTIVE_SUMMARY",
    format = "CSV",
    title: customTitle,
  } = options;

  await fs.mkdir(REPORTS_DIR, { recursive: true });

  // Resolve user ID if not provided (e.g. background/scheduled runs)
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const adminMember = await prisma.organizationMember.findFirst({
      where: { organizationId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
    if (adminMember) {
      resolvedUserId = adminMember.userId;
    } else {
      const anyUser = await prisma.user.findFirst({ select: { id: true } });
      resolvedUserId = anyUser?.id || "system";
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true },
  });
  const orgName = org?.name || "Enterprise Workspace";

  const dateFormatted = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const defaultTitle = `${type.replace(/_/g, " ")} (${dateFormatted})`;
  const reportTitle = customTitle || defaultTitle;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${type.toLowerCase()}_${timestamp}.${format.toLowerCase()}`;
  const filePath = path.join(REPORTS_DIR, fileName);

  let fileContent = "";

  if (type === "EXECUTIVE_SUMMARY") {
    const overview = await getOverviewData(organizationId);

    if (format === "CSV") {
      const lines: string[] = [
        `UWORK BUSINESS INTELLIGENCE — EXECUTIVE SUMMARY`,
        `Organization,${sanitizeSpreadsheetCell(orgName)}`,
        `Generated At,${new Date().toISOString()}`,
        `Report Type,${type}`,
        "",
        "EXECUTIVE KPIS",
        "Metric,Value",
        `Total Revenue,$${overview.kpis.totalRevenue.toLocaleString()}`,
        `MoM Revenue Growth,${overview.kpis.revenueGrowthMoM}%`,
        `Gross Profit,$${overview.kpis.grossProfit.toLocaleString()}`,
        `Gross Margin,${overview.kpis.grossMarginPct}%`,
        `Total Orders,${overview.kpis.totalOrders}`,
        `Average Order Value,$${overview.kpis.averageOrderValue}`,
        `Active Customers,${overview.kpis.activeCustomers}`,
        `Forecast Projected Revenue,$${overview.kpis.forecastProjectedRevenue.toLocaleString()}`,
        "",
        "BUSINESS HEALTH SCORE",
        `Overall Score,${overview.healthScore.overallScore}/100`,
        `Revenue Momentum,${overview.healthScore.revenueScore}/100`,
        `Profitability,${overview.healthScore.profitScore}/100`,
        `Customer Retention,${overview.healthScore.retentionScore}/100`,
        `Growth Velocity,${overview.healthScore.growthScore}/100`,
        `Predictability & Stability,${overview.healthScore.stabilityScore}/100`,
        "",
        "PRIORITIZED DECISIONS & RECOMMENDATIONS",
        "Priority,Title,Category,Impact Summary,Recommended Action",
      ];

      for (const item of overview.decisionItems) {
        lines.push(
          `"${sanitizeSpreadsheetCell(item.priority)}","${sanitizeSpreadsheetCell(
            item.title
          )}","${sanitizeSpreadsheetCell(item.category)}","${sanitizeSpreadsheetCell(
            item.impactSummary
          )}","${sanitizeSpreadsheetCell(item.recommendedAction)}"`
        );
      }

      fileContent = lines.join("\n");
    } else if (format === "JSON") {
      fileContent = JSON.stringify(
        {
          title: reportTitle,
          organization: orgName,
          generatedAt: new Date().toISOString(),
          type,
          data: overview,
        },
        null,
        2
      );
    } else {
      // HTML format
      fileContent = generateHtmlReportTemplate({
        title: reportTitle,
        orgName,
        type,
        generatedAt: new Date().toISOString(),
        sections: [
          {
            title: "Executive Key Performance Indicators",
            content: `
              <div class="kpi-grid">
                <div class="kpi-card"><span class="kpi-label">Total Revenue</span><span class="kpi-val">$${overview.kpis.totalRevenue.toLocaleString()}</span></div>
                <div class="kpi-card"><span class="kpi-label">Gross Margin</span><span class="kpi-val">${overview.kpis.grossMarginPct}%</span></div>
                <div class="kpi-card"><span class="kpi-label">MoM Growth</span><span class="kpi-val">${overview.kpis.revenueGrowthMoM}%</span></div>
                <div class="kpi-card"><span class="kpi-label">Total Orders</span><span class="kpi-val">${overview.kpis.totalOrders.toLocaleString()}</span></div>
                <div class="kpi-card"><span class="kpi-label">Active Customers</span><span class="kpi-val">${overview.kpis.activeCustomers.toLocaleString()}</span></div>
                <div class="kpi-card"><span class="kpi-label">Projected Revenue</span><span class="kpi-val">$${overview.kpis.forecastProjectedRevenue.toLocaleString()}</span></div>
              </div>
            `,
          },
          {
            title: "Business Health Score Breakdown",
            content: `
              <p>Overall Business Health Score: <strong>${overview.healthScore.overallScore}/100</strong></p>
              <table class="report-table">
                <thead><tr><th>Dimension</th><th>Score</th><th>Target Performance</th></tr></thead>
                <tbody>
                  <tr><td>Revenue Momentum</td><td>${overview.healthScore.revenueScore}/100</td><td>Healthy growth trajectory</td></tr>
                  <tr><td>Profitability</td><td>${overview.healthScore.profitScore}/100</td><td>Gross margin efficiency</td></tr>
                  <tr><td>Customer Retention</td><td>${overview.healthScore.retentionScore}/100</td><td>Cohort retention and low churn</td></tr>
                  <tr><td>Growth Velocity</td><td>${overview.healthScore.growthScore}/100</td><td>Customer expansion rate</td></tr>
                  <tr><td>Predictability & Stability</td><td>${overview.healthScore.stabilityScore}/100</td><td>Low forecast variance</td></tr>
                </tbody>
              </table>
            `,
          },
          {
            title: "Decision Center & Recommended Actions",
            content: `
              <table class="report-table">
                <thead><tr><th>Priority</th><th>Title</th><th>Category</th><th>Recommended Action</th></tr></thead>
                <tbody>
                  ${overview.decisionItems
                    .map(
                      (d: any) =>
                        `<tr><td><span class="badge ${d.priority.toLowerCase()}">${d.priority}</span></td><td><strong>${escapeHtml(
                          d.title
                        )}</strong></td><td>${escapeHtml(d.category)}</td><td>${escapeHtml(
                          d.recommendedAction
                        )}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `,
          },
        ],
      });
    }
  } else if (type === "SALES_DEEP_DIVE") {
    const sales = await getSalesAnalyticsData(organizationId);
    const overview = sales.overview || {
      pipelineTotal: 0,
      weightedPipeline: 0,
      winRatePct: 0,
      averageDealSize: 0,
      salesCycleDays: 0,
      dealsWonThisPeriod: 0,
    };
    const reps: any[] = sales.bySalesperson || [];

    if (format === "CSV") {
      const lines: string[] = [
        `UWORK BUSINESS INTELLIGENCE — SALES DEEP DIVE REPORT`,
        `Organization,${sanitizeSpreadsheetCell(orgName)}`,
        `Generated At,${new Date().toISOString()}`,
        "",
        "PIPELINE SUMMARY",
        "Metric,Value",
        `Total Pipeline,$${overview.pipelineTotal.toLocaleString()}`,
        `Weighted Pipeline,$${overview.weightedPipeline.toLocaleString()}`,
        `Win Rate,${overview.winRatePct}%`,
        `Avg Deal Size,$${overview.averageDealSize.toLocaleString()}`,
        `Sales Cycle Days,${overview.salesCycleDays}`,
        `Deals Won This Period,${overview.dealsWonThisPeriod}`,
        "",
        "REPRESENTATIVE PERFORMANCE",
        "Representative,Quota Attainment %,Deals Closed,Revenue Closed",
      ];

      for (const rep of reps) {
        lines.push(
          `"${sanitizeSpreadsheetCell(rep.name)}",${rep.quotaPct}%,${
            rep.deals
          },"$${rep.revenue.toLocaleString()}"`
        );
      }

      fileContent = lines.join("\n");
    } else if (format === "JSON") {
      fileContent = JSON.stringify(
        {
          title: reportTitle,
          organization: orgName,
          generatedAt: new Date().toISOString(),
          type,
          data: sales,
        },
        null,
        2
      );
    } else {
      fileContent = generateHtmlReportTemplate({
        title: reportTitle,
        orgName,
        type,
        generatedAt: new Date().toISOString(),
        sections: [
          {
            title: "Sales Pipeline Overview",
            content: `
              <div class="kpi-grid">
                <div class="kpi-card"><span class="kpi-label">Total Pipeline</span><span class="kpi-val">$${overview.pipelineTotal.toLocaleString()}</span></div>
                <div class="kpi-card"><span class="kpi-label">Win Rate</span><span class="kpi-val">${overview.winRatePct}%</span></div>
                <div class="kpi-card"><span class="kpi-label">Deals Won</span><span class="kpi-val">${overview.dealsWonThisPeriod}</span></div>
                <div class="kpi-card"><span class="kpi-label">Avg Deal Size</span><span class="kpi-val">$${overview.averageDealSize.toLocaleString()}</span></div>
                <div class="kpi-card"><span class="kpi-label">Sales Cycle</span><span class="kpi-val">${overview.salesCycleDays} days</span></div>
              </div>
            `,
          },
          {
            title: "Sales Representatives Leaderboard",
            content: `
              <table class="report-table">
                <thead><tr><th>Representative</th><th>Quota Attainment</th><th>Deals Closed</th><th>Revenue Closed</th></tr></thead>
                <tbody>
                  ${reps
                    .map(
                      (r: any) =>
                        `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${
                          r.quotaPct
                        }%</td><td>${r.deals}</td><td>$${r.revenue.toLocaleString()}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `,
          },
        ],
      });
    }

  } else if (type === "FORECAST_PROJECTION") {
    const latestForecast = await prisma.forecast.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        runs: {
          orderBy: { runNumber: "desc" },
          take: 1,
          include: {
            predictions: { orderBy: { timestamp: "asc" } },
            models: true,
          },
        },
      },
    });

    const latestRun = latestForecast?.runs[0];
    const predictions = latestRun?.predictions || [];
    const champion = latestRun?.models.find((m) => m.isChampion) || latestRun?.models[0];

    if (format === "CSV") {
      const lines: string[] = [
        `UWORK BUSINESS INTELLIGENCE — FORECAST PROJECTION REPORT`,
        `Organization,${sanitizeSpreadsheetCell(orgName)}`,
        `Forecast Name,${sanitizeSpreadsheetCell(latestForecast?.name || "Revenue Horizon")}`,
        `Champion Model,${champion?.modelType || "Holt-Winters"}`,
        `Horizon Periods,${latestForecast?.horizonPeriods || 6}`,
        `Confidence Level,95%`,
        "",
        "FORWARD PREDICTION POINTS",
        "Period,Predicted Value,Lower Bound (95%),Upper Bound (95%)",
      ];

      for (const p of predictions) {
        lines.push(
          `"${new Date(p.timestamp).toISOString().split("T")[0]}",$${p.predictedValue.toFixed(
            2
          )},$${p.confidenceLower.toFixed(2)},$${p.confidenceUpper.toFixed(2)}`
        );
      }

      fileContent = lines.join("\n");
    } else if (format === "JSON") {
      fileContent = JSON.stringify(
        {
          title: reportTitle,
          organization: orgName,
          generatedAt: new Date().toISOString(),
          type,
          forecast: latestForecast?.name,
          championModel: champion?.modelType,
          predictions,
        },
        null,
        2
      );
    } else {
      fileContent = generateHtmlReportTemplate({
        title: reportTitle,
        orgName,
        type,
        generatedAt: new Date().toISOString(),
        sections: [
          {
            title: "Forecast Tournament & Champion Model",
            content: `
              <p>Forecast Name: <strong>${escapeHtml(
                latestForecast?.name || "Operational Horizon"
              )}</strong></p>
              <p>Champion Model Selected: <strong>${escapeHtml(
                champion?.modelType || "HOLT_WINTERS"
              )}</strong></p>
              <p>Horizon: <strong>${latestForecast?.horizonPeriods || 6} months</strong> forward at 95% confidence.</p>
            `,
          },
          {
            title: "Forward Projected Values & Confidence Bounds",
            content: `
              <table class="report-table">
                <thead><tr><th>Period</th><th>Predicted Value</th><th>Lower Bound (95%)</th><th>Upper Bound (95%)</th></tr></thead>
                <tbody>
                  ${predictions
                    .map(
                      (p) =>
                        `<tr><td>${new Date(p.timestamp).toISOString().split("T")[0]}</td><td><strong>$${p.predictedValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}</strong></td><td>$${p.confidenceLower.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}</td><td>$${p.confidenceUpper.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `,
          },
        ],
      });
    }
  } else {
    // DATA_QUALITY
    const datasets = await prisma.dataset.findMany({
      where: { organizationId, isArchived: false },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            columns: true,
            validationResult: true,
          },
        },
      },
    });

    if (format === "CSV") {
      const lines: string[] = [
        `UWORK BUSINESS INTELLIGENCE — DATA QUALITY & SCHEMA AUDIT`,
        `Organization,${sanitizeSpreadsheetCell(orgName)}`,
        `Generated At,${new Date().toISOString()}`,
        "",
        "INGESTED DATASETS",
        "Dataset Name,Version,Rows,Columns,Quality Score %,Status",
      ];

      for (const ds of datasets) {
        const ver = ds.versions[0];
        const score = ver?.validationResult?.qualityScore?.toFixed(1) || "100.0";
        lines.push(
          `"${sanitizeSpreadsheetCell(ds.name)}",v${ver?.versionNumber || 1},${
            ver?.rowCount || 0
          },${ver?.columnCount || 0},${score}%,${ver?.status || "READY"}`
        );
      }

      lines.push("");
      lines.push("COLUMN CATALOG & INFERRED BUSINESS ROLES");
      lines.push("Dataset,Column Name,Data Type,Inferred Role,Null Count,Unique Values");

      for (const ds of datasets) {
        const ver = ds.versions[0];
        for (const col of ver?.columns || []) {
          lines.push(
            `"${sanitizeSpreadsheetCell(ds.name)}","${sanitizeSpreadsheetCell(
              col.name
            )}",${col.dataType},${col.inferredBusinessRole || "NONE"},${col.nullCount},${
              col.uniqueCount
            }`
          );
        }
      }

      fileContent = lines.join("\n");
    } else if (format === "JSON") {
      fileContent = JSON.stringify(
        {
          title: reportTitle,
          organization: orgName,
          generatedAt: new Date().toISOString(),
          type,
          datasets: datasets.map((d) => ({
            name: d.name,
            version: d.versions[0]?.versionNumber,
            qualityScore: d.versions[0]?.validationResult?.qualityScore,
            columns: d.versions[0]?.columns,
          })),
        },
        null,
        2
      );
    } else {
      fileContent = generateHtmlReportTemplate({
        title: reportTitle,
        orgName,
        type,
        generatedAt: new Date().toISOString(),
        sections: [
          {
            title: "Dataset Catalog & Quality Assessment",
            content: `
              <table class="report-table">
                <thead><tr><th>Dataset</th><th>Version</th><th>Rows</th><th>Columns</th><th>Quality Score</th></tr></thead>
                <tbody>
                  ${datasets
                    .map((ds) => {
                      const ver = ds.versions[0];
                      const score = ver?.validationResult?.qualityScore?.toFixed(1) || "100.0";
                      return `<tr><td><strong>${escapeHtml(ds.name)}</strong></td><td>v${
                        ver?.versionNumber || 1
                      }</td><td>${(ver?.rowCount || 0).toLocaleString()}</td><td>${
                        ver?.columnCount || 0
                      }</td><td><span class="badge high">${score}%</span></td></tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            `,
          },
        ],
      });
    }
  }

  await fs.writeFile(filePath, fileContent, "utf-8");

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  const report = await prisma.report.create({
    data: {
      organizationId,
      generatedById: resolvedUserId,
      title: reportTitle,
      type,
      format,
      storagePath: relativePath,
    },
  });

  // Publish to SSE event bus
  eventBus.publishToTenant(organizationId, "REPORT_READY", {
    reportId: report.id,
    title: report.title,
    format: report.format,
    type: report.type,
  });

  return {
    reportId: report.id,
    storagePath: relativePath,
    fileName,
    title: report.title,
    format,
    type,
  };
}

export async function generateExecutiveReport(
  organizationId: string,
  userId: string,
  format: "CSV" | "JSON" | "HTML" = "CSV"
): Promise<{ reportId: string; storagePath: string; fileName: string }> {
  const result = await generateReport({
    organizationId,
    userId,
    type: "EXECUTIVE_SUMMARY",
    format,
  });
  return {
    reportId: result.reportId,
    storagePath: result.storagePath,
    fileName: result.fileName,
  };
}

export async function deleteReport(organizationId: string, reportId: string): Promise<boolean> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, organizationId },
  });

  if (!report) return false;

  await deleteStorageFile(report.storagePath);
  await prisma.report.delete({ where: { id: report.id } });
  return true;
}

// ----------------------------------------------------------------------
// 2. Scheduled Digests & Cron Parser Engine
// ----------------------------------------------------------------------

/**
 * Computes the next execution timestamp from a standard 5-field cron expression:
 * Format: minute hour day-of-month month day-of-week
 */
export function computeNextRun(cronExpression: string, fromDate = new Date()): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Default fallback: 24 hours from now
    return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  }

  const [minStr, hourStr, , , dowStr] = parts;

  const next = new Date(fromDate.getTime());
  next.setSeconds(0);
  next.setMilliseconds(0);

  // Common preset: "*/N * * * *" (Every N minutes)
  if (minStr.startsWith("*/")) {
    const step = parseInt(minStr.replace("*/", ""), 10) || 15;
    const currentMin = next.getMinutes();
    const nextSlot = (Math.floor(currentMin / step) + 1) * step;
    if (nextSlot >= 60) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(nextSlot % 60);
    } else {
      next.setMinutes(nextSlot);
    }
    return next;
  }

  // Common preset: "0 * * * *" (Hourly)
  if (minStr === "0" && hourStr === "*") {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
    return next;
  }

  const targetMin = parseInt(minStr, 10) || 0;
  const targetHour = hourStr === "*" ? next.getHours() : parseInt(hourStr, 10) || 0;

  // Preset: Weekly "0 9 * * 1" (Monday at 9am)
  if (dowStr !== "*") {
    const targetDow = parseInt(dowStr, 10);
    next.setHours(targetHour, targetMin, 0, 0);

    let daysUntil = (targetDow - next.getDay() + 7) % 7;
    if (daysUntil === 0 && next <= fromDate) {
      daysUntil = 7;
    }
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  // Daily at specific hour: "0 9 * * *"
  next.setHours(targetHour, targetMin, 0, 0);
  if (next <= fromDate) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export async function createReportSchedule(
  organizationId: string,
  data: {
    title: string;
    cronExpression: string;
    recipients: string[];
    reportType?: ReportType;
  }
) {
  const nextRunAt = computeNextRun(data.cronExpression);

  const schedule = await prisma.reportSchedule.create({
    data: {
      organizationId,
      title: data.title,
      cronExpression: data.cronExpression,
      recipientsJson: JSON.stringify(data.recipients || []),
      reportType: data.reportType || "EXECUTIVE_SUMMARY",
      isActive: true,
      nextRunAt,
    },
  });

  return schedule;
}

export async function listReportSchedules(organizationId: string) {
  return prisma.reportSchedule.findMany({
    where: { organizationId },
    orderBy: { title: "asc" },
  });
}

export async function updateReportSchedule(
  organizationId: string,
  scheduleId: string,
  data: {
    title?: string;
    cronExpression?: string;
    recipients?: string[];
    reportType?: ReportType;
    isActive?: boolean;
  }
) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!existing) return null;

  const updatePayload: any = {};
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.reportType !== undefined) updatePayload.reportType = data.reportType;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
  if (data.recipients !== undefined) {
    updatePayload.recipientsJson = JSON.stringify(data.recipients);
  }
  if (data.cronExpression !== undefined) {
    updatePayload.cronExpression = data.cronExpression;
    updatePayload.nextRunAt = computeNextRun(data.cronExpression);
  }

  return prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: updatePayload,
  });
}

export async function deleteReportSchedule(organizationId: string, scheduleId: string) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!existing) return false;

  await prisma.reportSchedule.delete({ where: { id: scheduleId } });
  return true;
}

export async function executeScheduledDigests(targetOrgId?: string, targetScheduleId?: string) {
  const now = new Date();

  const whereClause: any = {
    isActive: true,
    ...(targetOrgId ? { organizationId: targetOrgId } : {}),
    ...(targetScheduleId ? { id: targetScheduleId } : {}),
  };

  if (!targetScheduleId) {
    whereClause.OR = [
      { nextRunAt: { lte: now } },
      { nextRunAt: null },
      { lastRunAt: null },
    ];
  }

  const dueSchedules = await prisma.reportSchedule.findMany({
    where: whereClause,
  });

  const executionResults: Array<{
    scheduleId: string;
    title: string;
    reportId: string;
    deliveredTo: string[];
    nextRunAt: Date;
  }> = [];

  for (const schedule of dueSchedules) {
    let recipients: string[] = [];
    try {
      recipients = JSON.parse(schedule.recipientsJson || "[]");
    } catch {
      recipients = [];
    }

    // Generate the scheduled report
    const report = await generateReport({
      organizationId: schedule.organizationId,
      type: (schedule.reportType as ReportType) || "EXECUTIVE_SUMMARY",
      format: "CSV",
      title: `${schedule.title} (Scheduled Digest)`,
    });

    // Create In-App Notification
    await prisma.notification.create({
      data: {
        organizationId: schedule.organizationId,
        title: "Scheduled Digest Generated",
        message: `Scheduled report "${schedule.title}" (${schedule.reportType}) has been generated and dispatched to ${recipients.length} recipients.`,
        type: "REPORT_READY",
        linkUrl: `/reports`,
      },
    });

    // Advance next run
    const nextRun = computeNextRun(schedule.cronExpression, now);

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        nextRunAt: nextRun,
      },
    });

    executionResults.push({
      scheduleId: schedule.id,
      title: schedule.title,
      reportId: report.reportId,
      deliveredTo: recipients,
      nextRunAt: nextRun,
    });
  }

  return executionResults;
}

// ----------------------------------------------------------------------
// 3. HTML Report Template Generator
// ----------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateHtmlReportTemplate(params: {
  title: string;
  orgName: string;
  type: string;
  generatedAt: string;
  sections: Array<{ title: string; content: string }>;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(params.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 40px;
      line-height: 1.5;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 36px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 {
      font-size: 24px;
      margin: 0 0 6px 0;
      color: #ffffff;
    }
    .header .meta {
      font-size: 12px;
      color: #94a3b8;
    }
    .section {
      margin-bottom: 32px;
    }
    .section h2 {
      font-size: 16px;
      color: #60a5fa;
      border-bottom: 1px solid #334155;
      padding-bottom: 8px;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
    }
    .kpi-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .kpi-val {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 10px;
    }
    .report-table th, .report-table td {
      border: 1px solid #334155;
      padding: 10px 14px;
      text-align: left;
    }
    .report-table th {
      background: #0f172a;
      color: #cbd5e1;
      font-weight: 600;
    }
    .report-table tr:nth-child(even) {
      background: #1e293b;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge.high { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge.medium { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge.low { background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.4); }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #334155;
      padding-top: 16px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { background: #ffffff; color: #000000; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; background: #ffffff; }
      .header h1 { color: #000000; }
      .kpi-card { background: #f8fafc; border-color: #cbd5e1; }
      .kpi-val { color: #000000; }
      .report-table th { background: #f1f5f9; color: #000000; }
      .report-table td { color: #000000; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>${escapeHtml(params.title)}</h1>
        <div class="meta">Organization: <strong>${escapeHtml(params.orgName)}</strong> • Type: ${escapeHtml(
    params.type
  )}</div>
      </div>
      <div class="meta" style="text-align: right;">
        Generated: ${escapeHtml(params.generatedAt)}<br>
        UWORK Enterprise BI Engine
      </div>
    </div>

    ${params.sections
      .map(
        (s) => `
      <div class="section">
        <h2>${escapeHtml(s.title)}</h2>
        ${s.content}
      </div>
    `
      )
      .join("")}

    <div class="footer">
      <span>Confidential — Internal Enterprise Use Only</span>
      <span>UWORK Autonomous BI & Forecasting Platform</span>
    </div>
  </div>
</body>
</html>`;
}
