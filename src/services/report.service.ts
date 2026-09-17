import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/db/prisma";
import { sanitizeSpreadsheetCell } from "../lib/security/sanitize";
import { getOverviewData } from "./analytics.service";

const REPORTS_DIR = path.resolve(process.cwd(), "storage", "reports");

export async function generateExecutiveReport(
  organizationId: string,
  userId: string,
  format: "CSV" | "JSON" = "CSV"
): Promise<{ reportId: string; storagePath: string; fileName: string }> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const overview = await getOverviewData(organizationId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `Executive_Summary_${timestamp}.${format.toLowerCase()}`;
  const filePath = path.join(REPORTS_DIR, fileName);

  let fileContent = "";

  if (format === "CSV") {
    const lines: string[] = [
      "UWORK BUSINESS INTELLIGENCE — EXECUTIVE REPORT",
      `Generated At,${new Date().toISOString()}`,
      `Organization ID,${organizationId}`,
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
      `Revenue Score,${overview.healthScore.revenueScore}/100`,
      `Profit Score,${overview.healthScore.profitScore}/100`,
      `Retention Score,${overview.healthScore.retentionScore}/100`,
      `Growth Score,${overview.healthScore.growthScore}/100`,
      `Stability Score,${overview.healthScore.stabilityScore}/100`,
      "",
      "PRIORITIZED DECISIONS & RECOMMENDATIONS",
      "Priority,Title,Category,Impact Summary,Recommended Action",
    ];

    for (const item of overview.decisionItems) {
      const sanitizedTitle = sanitizeSpreadsheetCell(item.title);
      const sanitizedImpact = sanitizeSpreadsheetCell(item.impactSummary);
      const sanitizedAction = sanitizeSpreadsheetCell(item.recommendedAction);
      lines.push(
        `"${item.priority}","${sanitizedTitle}","${item.category}","${sanitizedImpact}","${sanitizedAction}"`
      );
    }

    fileContent = lines.join("\n");
  } else {
    fileContent = JSON.stringify(overview, null, 2);
  }

  await fs.writeFile(filePath, fileContent, "utf-8");

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  const report = await prisma.report.create({
    data: {
      organizationId,
      generatedById: userId,
      title: `Executive Intelligence Report (${new Date().toLocaleDateString()})`,
      type: "EXECUTIVE_SUMMARY",
      format,
      storagePath: relativePath,
    },
  });

  return {
    reportId: report.id,
    storagePath: relativePath,
    fileName,
  };
}

