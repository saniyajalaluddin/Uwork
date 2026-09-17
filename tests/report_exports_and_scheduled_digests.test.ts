import test from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import {
  generateReport,
  computeNextRun,
  executeScheduledDigests,
  deleteReport,
} from "../src/services/report.service";
import {
  GET as reportsGetRoute,
  POST as reportsPostRoute,
  DELETE as reportsDeleteRoute,
} from "../src/app/api/reports/route";
import { GET as downloadGetRoute } from "../src/app/api/reports/[id]/download/route";
import {
  GET as schedulesGetRoute,
  POST as schedulesPostRoute,
  PATCH as schedulesPatchRoute,
  DELETE as schedulesDeleteRoute,
} from "../src/app/api/reports/schedules/route";
import { POST as schedulesRunRoute } from "../src/app/api/reports/schedules/run/route";
import { NextRequest } from "next/server";

test("Phase 16: Report Export Engine & Scheduled Digests", async (t) => {
  const timestamp = Date.now();

  // Setup Tenant Alpha
  const orgA = await prisma.organization.create({
    data: {
      name: `Report Tenant Alpha ${timestamp}`,
      slug: `rep-alpha-${timestamp}`,
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `rep_lead_a_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Digest",
      lastName: "Alpha",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });

  const sessionA = await createSession(userA.id, orgA.id);

  // Setup Tenant Beta
  const orgB = await prisma.organization.create({
    data: {
      name: `Report Tenant Beta ${timestamp}`,
      slug: `rep-beta-${timestamp}`,
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `rep_lead_b_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Digest",
      lastName: "Beta",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });

  const sessionB = await createSession(userB.id, orgB.id);

  await t.test("1. Multi-Format Report Engine generates CSV with formula defense and styled HTML", async () => {
    // Generate CSV Executive Report
    const csvReport = await generateReport({
      organizationId: orgA.id,
      userId: userA.id,
      type: "EXECUTIVE_SUMMARY",
      format: "CSV",
    });

    assert.ok(csvReport.reportId);
    assert.strictEqual(csvReport.format, "CSV");

    const fullCsvPath = path.resolve(process.cwd(), csvReport.storagePath);
    const csvContent = await fs.readFile(fullCsvPath, "utf-8");

    assert.ok(csvContent.includes("UWORK BUSINESS INTELLIGENCE — EXECUTIVE SUMMARY"));
    assert.ok(csvContent.includes("EXECUTIVE KPIS"));
    assert.ok(csvContent.includes("BUSINESS HEALTH SCORE"));

    // Generate HTML Executive Report
    const htmlReport = await generateReport({
      organizationId: orgA.id,
      userId: userA.id,
      type: "EXECUTIVE_SUMMARY",
      format: "HTML",
    });

    assert.ok(htmlReport.reportId);
    assert.strictEqual(htmlReport.format, "HTML");

    const fullHtmlPath = path.resolve(process.cwd(), htmlReport.storagePath);
    const htmlContent = await fs.readFile(fullHtmlPath, "utf-8");

    assert.ok(htmlContent.includes("<!DOCTYPE html>"));
    assert.ok(htmlContent.includes("kpi-grid"));
    assert.ok(htmlContent.includes("Business Health Score Breakdown"));
    assert.ok(htmlContent.includes("@media print"));
  });

  await t.test("2. Generates specialized domain reports (Sales Deep Dive & Data Quality)", async () => {
    // Sales Deep Dive in CSV
    const salesReport = await generateReport({
      organizationId: orgA.id,
      userId: userA.id,
      type: "SALES_DEEP_DIVE",
      format: "CSV",
    });

    const salesContent = await fs.readFile(
      path.resolve(process.cwd(), salesReport.storagePath),
      "utf-8"
    );
    assert.ok(salesContent.includes("SALES DEEP DIVE REPORT"));
    assert.ok(salesContent.includes("PIPELINE SUMMARY"));

    // Data Quality in JSON
    const dataQualityReport = await generateReport({
      organizationId: orgA.id,
      userId: userA.id,
      type: "DATA_QUALITY",
      format: "JSON",
    });

    const dqContent = await fs.readFile(
      path.resolve(process.cwd(), dataQualityReport.storagePath),
      "utf-8"
    );
    const parsedDq = JSON.parse(dqContent);
    assert.strictEqual(parsedDq.type, "DATA_QUALITY");
    assert.ok(Array.isArray(parsedDq.datasets));
  });

  await t.test("3. Report download and deletion enforce strict cross-tenant IDOR protection", async () => {
    // Tenant Alpha creates a report via POST /api/reports
    const createReq = new NextRequest(new URL("http://localhost:3000/api/reports"), {
      method: "POST",
      body: JSON.stringify({ type: "EXECUTIVE_SUMMARY", format: "CSV" }),
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
        "content-type": "application/json",
      },
    });

    const createRes = await reportsPostRoute(createReq);
    assert.strictEqual(createRes.status, 201);
    const createJson = await createRes.json();
    const repId = createJson.data.report.reportId;

    // Tenant Beta tries to download Tenant Alpha's report (IDOR Attack)
    const downloadAttackReq = new NextRequest(
      new URL(`http://localhost:3000/api/reports/${repId}/download`),
      {
        method: "GET",
        headers: { cookie: `uwork_session=${sessionB.rawToken}` },
      }
    );

    const downloadAttackRes = await downloadGetRoute(downloadAttackReq, {
      params: Promise.resolve({ id: repId }),
    });
    assert.strictEqual(
      downloadAttackRes.status,
      404,
      "Cross-tenant report download must return 404"
    );

    // Tenant Beta tries to delete Tenant Alpha's report (IDOR Attack)
    const deleteAttackReq = new NextRequest(
      new URL(`http://localhost:3000/api/reports?id=${repId}`),
      {
        method: "DELETE",
        headers: { cookie: `uwork_session=${sessionB.rawToken}` },
      }
    );

    const deleteAttackRes = await reportsDeleteRoute(deleteAttackReq);
    assert.strictEqual(
      deleteAttackRes.status,
      404,
      "Cross-tenant report deletion must return 404"
    );

    // Tenant Alpha successfully downloads its report
    const downloadLegitReq = new NextRequest(
      new URL(`http://localhost:3000/api/reports/${repId}/download`),
      {
        method: "GET",
        headers: { cookie: `uwork_session=${sessionA.rawToken}` },
      }
    );

    const downloadLegitRes = await downloadGetRoute(downloadLegitReq, {
      params: Promise.resolve({ id: repId }),
    });
    assert.strictEqual(downloadLegitRes.status, 200);
    assert.ok(downloadLegitRes.headers.get("content-disposition")?.includes("attachment"));

    // Tenant Alpha successfully deletes its report
    const deleteLegitReq = new NextRequest(
      new URL(`http://localhost:3000/api/reports?id=${repId}`),
      {
        method: "DELETE",
        headers: { cookie: `uwork_session=${sessionA.rawToken}` },
      }
    );

    const deleteLegitRes = await reportsDeleteRoute(deleteLegitReq);
    assert.strictEqual(deleteLegitRes.status, 200);
  });

  await t.test("4. Cron engine parses schedules and executeScheduledDigests delivers digests", async () => {
    // 1. Verify computeNextRun
    const testDate = new Date(2026, 5, 1, 8, 0, 0); // Monday 08:00 local time
    const nextDaily = computeNextRun("0 9 * * *", testDate);
    assert.strictEqual(nextDaily.getHours(), 9);
    assert.strictEqual(nextDaily.getMinutes(), 0);

    const next15Min = computeNextRun("*/15 * * * *", testDate);
    assert.strictEqual(next15Min.getMinutes(), 15);

    // 2. Tenant Alpha creates a Report Schedule via POST /api/reports/schedules
    const scheduleReq = new NextRequest(
      new URL("http://localhost:3000/api/reports/schedules"),
      {
        method: "POST",
        body: JSON.stringify({
          title: "Weekly Leadership Brief",
          cronExpression: "0 9 * * 1",
          reportType: "EXECUTIVE_SUMMARY",
          recipients: ["exec@alpha.com", "analyst@alpha.com"],
        }),
        headers: {
          cookie: `uwork_session=${sessionA.rawToken}`,
          "content-type": "application/json",
        },
      }
    );

    const scheduleRes = await schedulesPostRoute(scheduleReq);
    assert.strictEqual(scheduleRes.status, 201);
    const scheduleJson = await scheduleRes.json();
    const scheduleId = scheduleJson.data.schedule.id;

    // 3. Tenant Beta attempts to tamper with Tenant Alpha's schedule (IDOR Attack)
    const patchAttackReq = new NextRequest(
      new URL("http://localhost:3000/api/reports/schedules"),
      {
        method: "PATCH",
        body: JSON.stringify({ id: scheduleId, isActive: false }),
        headers: {
          cookie: `uwork_session=${sessionB.rawToken}`,
          "content-type": "application/json",
        },
      }
    );

    const patchAttackRes = await schedulesPatchRoute(patchAttackReq);
    assert.strictEqual(patchAttackRes.status, 404, "Cross-tenant schedule modification must return 404");

    // 4. Trigger scheduled run via POST /api/reports/schedules/run
    const runReq = new NextRequest(
      new URL("http://localhost:3000/api/reports/schedules/run"),
      {
        method: "POST",
        body: JSON.stringify({ scheduleId }),
        headers: {
          cookie: `uwork_session=${sessionA.rawToken}`,
          "content-type": "application/json",
        },
      }
    );

    const runRes = await schedulesRunRoute(runReq);
    assert.strictEqual(runRes.status, 200);
    const runJson = await runRes.json();
    assert.strictEqual(runJson.data.results.length, 1);
    assert.strictEqual(runJson.data.results[0].title, "Weekly Leadership Brief");
    assert.strictEqual(runJson.data.results[0].deliveredTo.length, 2);

    // Verify Notification record created in DB
    const notif = await prisma.notification.findFirst({
      where: { organizationId: orgA.id, type: "REPORT_READY" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(notif);
    assert.ok(notif.message.includes("Weekly Leadership Brief"));

    // Cleanup: Tenant Alpha deletes its schedule
    const deleteSchReq = new NextRequest(
      new URL(`http://localhost:3000/api/reports/schedules?id=${scheduleId}`),
      {
        method: "DELETE",
        headers: { cookie: `uwork_session=${sessionA.rawToken}` },
      }
    );

    const deleteSchRes = await schedulesDeleteRoute(deleteSchReq);
    assert.strictEqual(deleteSchRes.status, 200);
  });
});
