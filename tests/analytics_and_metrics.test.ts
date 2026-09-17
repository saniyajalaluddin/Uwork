import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { saveUploadedFile } from "../src/lib/storage/storage";
import {
  getOverviewData,
  getSalesAnalyticsData,
  getCustomerAnalyticsData,
  getProductAnalyticsData,
} from "../src/services/analytics.service";
import { processAssistantQuery } from "../src/services/assistant.service";
import { GET as getOverviewRoute } from "../src/app/api/analytics/overview/route";
import { GET as getSalesRoute } from "../src/app/api/analytics/sales/route";
import { GET as getCustomersRoute } from "../src/app/api/analytics/customers/route";
import { GET as getProductsRoute } from "../src/app/api/analytics/products/route";
import { NextRequest } from "next/server";

test("Phase 5: Authentic Multi-Tenant Analytics & Dynamic Metric Aggregation", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("AnalyticsPass123!#");

  // Tenant Alpha (With custom ingested dataset)
  const orgA = await prisma.organization.create({
    data: { name: `Solaris Energy ${timestamp}`, slug: `solaris-${timestamp}` },
  });
  const userA = await prisma.user.create({
    data: {
      email: `solaris_user_${timestamp}@example.com`,
      passwordHash,
      firstName: "Elena",
      lastName: "Solaris",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });
  const sessionA = await createSession(userA.id, orgA.id);

  // Tenant Beta (Brand new tenant with zero datasets)
  const orgB = await prisma.organization.create({
    data: { name: `Quantum Bio ${timestamp}`, slug: `quantum-${timestamp}` },
  });
  const userB = await prisma.user.create({
    data: {
      email: `quantum_user_${timestamp}@example.com`,
      passwordHash,
      firstName: "Marcus",
      lastName: "Quantum",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });
  const sessionB = await createSession(userB.id, orgB.id);

  // Ingest custom dataset specifically for Tenant Alpha
  const customCsv = [
    "Date,Product,Region,Customer,Revenue,Cost,Salesperson",
    "2026-01-15,Solar Panel Gen3,West Coast,SOL-101,50000,15000,Sarah Connor",
    "2026-02-10,Solar Panel Gen3,West Coast,SOL-101,60000,18000,Sarah Connor",
    "2026-02-20,Wind Turbine X1,Midwest,SOL-102,120000,45000,Kyle Reese",
    "2026-03-05,Battery Pack Pro,East Coast,SOL-103,40000,12000,John Connor",
    "2026-03-18,Battery Pack Pro,East Coast,SOL-104,30000,9000,John Connor",
  ].join("\n");
  // Total Revenue = 50k + 60k + 120k + 40k + 30k = 300,000
  // Total Cost = 15k + 18k + 45k + 12k + 9k = 99,000
  // Gross Profit = 201,000, Gross Margin = 67.0%
  // Unique Customers = 4 (SOL-101, SOL-102, SOL-103, SOL-104)
  // Products: Wind Turbine X1 (120k, 40%), Solar Panel Gen3 (110k, 37%), Battery Pack Pro (70k, 23%)

  const savedStorage = await saveUploadedFile(orgA.id, "solaris_transactions.csv", Buffer.from(customCsv, "utf-8"));

  const datasetA = await prisma.dataset.create({
    data: {
      organizationId: orgA.id,
      name: "Solaris Q1 Clean Energy Sales",
      createdById: userA.id,
    },
  });

  const versionA = await prisma.datasetVersion.create({
    data: {
      datasetId: datasetA.id,
      versionNumber: 1,
      storagePath: savedStorage.storagePath,
      fileName: savedStorage.sanitizedName,
      fileSizeBytes: savedStorage.fileSizeBytes,
      mimeType: "text/csv",
      rowCount: 5,
      columnCount: 7,
      checksumSha256: savedStorage.checksumSha256,
      status: "READY",
    },
  });

  await prisma.dataset.update({
    where: { id: datasetA.id },
    data: { currentVersionId: versionA.id },
  });

  // Create columns with inferred business roles
  const columnDefs = [
    { name: "Date", dataType: "DATE", role: "DATE_TIME" },
    { name: "Product", dataType: "CATEGORICAL", role: "PRODUCT_ID" },
    { name: "Region", dataType: "CATEGORICAL", role: "REGION" },
    { name: "Customer", dataType: "CATEGORICAL", role: "CUSTOMER_ID" },
    { name: "Revenue", dataType: "NUMERIC", role: "REVENUE" },
    { name: "Cost", dataType: "NUMERIC", role: "COST" },
    { name: "Salesperson", dataType: "CATEGORICAL", role: "GENERIC_DIMENSION" },
  ];

  for (let i = 0; i < columnDefs.length; i++) {
    await prisma.datasetColumn.create({
      data: {
        datasetVersionId: versionA.id,
        columnIndex: i,
        name: columnDefs[i].name,
        originalName: columnDefs[i].name,
        dataType: columnDefs[i].dataType,
        inferredBusinessRole: columnDefs[i].role,
      },
    });
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Authentic Dynamic Aggregation for Tenant Alpha
    // ------------------------------------------------------------------------
    await t.test("1. Computes genuine dynamic overview metrics directly from ingested dataset rows", async () => {
      const overview = await getOverviewData(orgA.id);

      assert.strictEqual(overview.dataSource, "INGESTED_DATASET", "Must use ingested dataset");
      assert.strictEqual(overview.kpis.totalRevenue, 300000, "Total revenue must equal exact sum of rows (300,000)");
      assert.strictEqual(overview.kpis.totalOrders, 5, "Total orders must equal exact row count (5)");
      assert.strictEqual(overview.kpis.activeCustomers, 4, "Active customers must equal 4 unique customer IDs");
      assert.strictEqual(overview.kpis.grossProfit, 201000, "Gross profit must be 300k - 99k = 201k");
      assert.strictEqual(overview.kpis.grossMarginPct, 67.0, "Gross margin must be 67.0%");

      // Verify dynamic top products
      assert.strictEqual(overview.topProducts.length, 3);
      assert.strictEqual(overview.topProducts[0].name, "Wind Turbine X1");
      assert.strictEqual(overview.topProducts[0].revenue, 120000);
      assert.strictEqual(overview.topProducts[0].sharePct, 40);

      // Verify dynamic top regions
      assert.strictEqual(overview.topRegions.length, 3);
      const midwest = overview.topRegions.find((r: any) => r.region === "Midwest");
      assert.strictEqual(midwest?.revenue, 120000);

    });

    // ------------------------------------------------------------------------
    // TEST 2: Dynamic Sales & Customer RFM Analytics
    // ------------------------------------------------------------------------
    await t.test("2. Generates dynamic sales pipeline and customer RFM cohorts from tenant transactions", async () => {
      const sales = await getSalesAnalyticsData(orgA.id);
      assert.strictEqual(sales.dataSource, "INGESTED_DATASET");
      assert.strictEqual(sales.overview.dealsWonThisPeriod, 5);
      assert.strictEqual(sales.overview.averageDealSize, 60000); // 300k / 5
      assert.ok(sales.bySalesperson.length > 0);
      assert.strictEqual(sales.bySalesperson[0].name, "Kyle Reese");
      assert.strictEqual(sales.bySalesperson[0].revenue, 120000);

      const customers = await getCustomerAnalyticsData(orgA.id);
      assert.strictEqual(customers.dataSource, "INGESTED_DATASET");
      assert.strictEqual(customers.summary.totalCustomers, 4);
      assert.strictEqual(customers.summary.customerLifetimeValue, 75000); // 300k / 4
      assert.strictEqual(customers.rfmSegments.length, 5);

      const products = await getProductAnalyticsData(orgA.id);
      assert.strictEqual(products.dataSource, "INGESTED_DATASET");
      assert.ok(products.bcgMatrix.length >= 2);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Multi-Tenant Isolation & Zero Leakage to Tenant Beta
    // ------------------------------------------------------------------------
    await t.test("3. Ensures newly created Tenant Beta sees EMPTY_WORKSPACE and zero Tenant Alpha metrics", async () => {
      const overviewB = await getOverviewData(orgB.id);
      assert.strictEqual(overviewB.dataSource, "EMPTY_WORKSPACE", "Must flag EMPTY_WORKSPACE");
      assert.strictEqual(overviewB.kpis.totalRevenue, 0, "Revenue must be 0 for empty tenant");
      assert.strictEqual(overviewB.kpis.totalOrders, 0, "Orders must be 0");
      assert.strictEqual(overviewB.topProducts.length, 0, "No products must be returned");
      assert.strictEqual(overviewB.topRegions.length, 0, "No regions must be returned");

      const salesB = await getSalesAnalyticsData(orgB.id);
      assert.strictEqual(salesB.dataSource, "EMPTY_WORKSPACE");
      assert.strictEqual(salesB.overview.pipelineTotal, 0);
      assert.strictEqual(salesB.bySalesperson.length, 0);

      const customersB = await getCustomerAnalyticsData(orgB.id);
      assert.strictEqual(customersB.dataSource, "EMPTY_WORKSPACE");
      assert.strictEqual(customersB.summary.totalCustomers, 0);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Assistant Service Tenant Privacy (No "Apex Global" Hardcoded Leaks)
    // ------------------------------------------------------------------------
    await t.test("4. AI Assistant overview response references Tenant Alpha's name and dynamic metrics", async () => {
      const assistantResponse = await processAssistantQuery(orgA.id, "give me an executive overview");
      assert.strictEqual(assistantResponse.domain, "EXECUTIVE_OVERVIEW");
      assert.ok(
        assistantResponse.answer.includes(orgA.name),
        `Assistant answer must cite '${orgA.name}', answer was: ${assistantResponse.answer}`
      );
      assert.ok(
        !assistantResponse.answer.includes("Apex Global"),
        "Assistant must not leak 'Apex Global' to other tenants"
      );
      assert.strictEqual(assistantResponse.groundedMetrics.totalRevenue, 300000);
    });

    // ------------------------------------------------------------------------
    // TEST 5: REST API Multi-Tenant Scoping for Overview, Sales, Customers, Products
    // ------------------------------------------------------------------------
    await t.test("5. REST API routes return properly scoped metrics based on session context", async () => {
      // Tenant Alpha request
      const reqOverviewA = new NextRequest("http://localhost:3000/api/analytics/overview", {
        headers: new Headers({ cookie: `uwork_session=${sessionA.rawToken}` }),
      });
      const resA = await getOverviewRoute(reqOverviewA);
      const jsonA = await resA.json();
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(jsonA.data.kpis.totalRevenue, 300000);
      assert.strictEqual(jsonA.data.dataSource, "INGESTED_DATASET");

      // Tenant Beta request
      const reqOverviewB = new NextRequest("http://localhost:3000/api/analytics/overview", {
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const resB = await getOverviewRoute(reqOverviewB);
      const jsonB = await resB.json();
      assert.strictEqual(resB.status, 200);
      assert.strictEqual(jsonB.data.kpis.totalRevenue, 0);
      assert.strictEqual(jsonB.data.dataSource, "EMPTY_WORKSPACE");

      // Unauthenticated request
      const reqUnauth = new NextRequest("http://localhost:3000/api/analytics/sales");
      const resUnauth = await getSalesRoute(reqUnauth);
      assert.strictEqual(resUnauth.status, 401);
    });

  } finally {
    // Teardown test orgs
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
  }
});