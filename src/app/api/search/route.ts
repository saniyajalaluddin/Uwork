import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  if (!q) {
    return successResponse({ results: [] });
  }

  // Predefined navigational links
  const navigationItems = [
    { title: "Overview Dashboard", category: "Navigation", url: "/overview", snippet: "Executive KPIs, Business Health Score & Recharts timeline" },
    { title: "Sales Intelligence", category: "Navigation", url: "/sales", snippet: "Sales pipeline, win rates & quota tracking" },
    { title: "Revenue Intelligence", category: "Navigation", url: "/revenue", snippet: "Territory and product stream contributions" },
    { title: "Customer Intelligence (RFM)", category: "Navigation", url: "/customers", snippet: "Behavioral RFM clustering and churn indicators" },
    { title: "Product Intelligence (BCG Matrix)", category: "Navigation", url: "/products", snippet: "Portfolio BCG classification (Stars, Cash Cows, Dogs)" },
    { title: "Forecasting Engine", category: "Navigation", url: "/forecasting", snippet: "Holt-Winters, ARIMA, Random Forest model tournament" },
    { title: "Anomaly Detection", category: "Navigation", url: "/anomalies", snippet: "Z-score and IQR statistical variance events" },
    { title: "Decision Center & Insights", category: "Navigation", url: "/insights", snippet: "Prioritized evidence-linked recommendations" },
    { title: "AI Business Assistant", category: "Navigation", url: "/assistant", snippet: "Natural language query agent with database citations" },
    { title: "Data Hub & Profiler", category: "Navigation", url: "/data-hub", snippet: "File upload, schema inference, quality scores" },
    { title: "Reports & Exports", category: "Navigation", url: "/reports", snippet: "Generate and audit CSV and JSON reports" },
    { title: "Settings & Administration", category: "Navigation", url: "/settings", snippet: "Member management, benefits, password change, audit" },
  ];

  const matchedNav = navigationItems.filter(
    (item) =>
      item.title.toLowerCase().includes(q) || item.snippet.toLowerCase().includes(q)
  );

  // Database searches
  const [datasets, decisions, anomalies] = await Promise.all([
    prisma.dataset.findMany({
      where: {
        organizationId: orgId,
        isArchived: false,
        name: { contains: q },
      },
      take: 5,
    }),
    prisma.decisionItem.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { title: { contains: q } },
          { recommendedAction: { contains: q } },
        ],
      },
      take: 5,
    }),
    prisma.anomaly.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { metricName: { contains: q } },
          { timestamp: { contains: q } },
        ],
      },
      take: 5,
    }),
  ]);

  const results = [
    ...matchedNav.map((n) => ({
      title: n.title,
      category: n.category,
      url: n.url,
      description: n.snippet,
    })),
    ...datasets.map((d) => ({
      title: d.name,
      category: "Dataset",
      url: "/data-hub",
      description: d.description || "Ingested business data stream",
    })),
    ...decisions.map((dec) => ({
      title: dec.title,
      category: "Decision Center",
      url: "/insights",
      description: dec.recommendedAction,
    })),
    ...anomalies.map((a) => ({
      title: `${a.metricName} Variance (${a.timestamp})`,
      category: "Anomaly",
      url: "/anomalies",
      description: `Observed ${a.observedValue} (${a.severity} severity)`,
    })),
  ];

  return successResponse({ results });
}

