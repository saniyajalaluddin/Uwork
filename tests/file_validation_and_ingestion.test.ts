import test from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import { validateFileBuffer, containsFormulaInjection } from "../src/lib/security/file-validator";
import { profileDataset, parseFileBuffer } from "../src/services/profiler.service";
import { POST as uploadDataset } from "../src/app/api/datasets/upload/route";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { NextRequest } from "next/server";

test("Phase 3: Secure Dataset Ingestion & File Validation", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("IngestionPass123!#");

  // Setup test organization and user
  const org = await prisma.organization.create({
    data: { name: `Ingestion Org ${timestamp}`, slug: `ingestion-org-${timestamp}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `ingest_tester_${timestamp}@example.com`,
      passwordHash,
      firstName: "File",
      lastName: "Tester",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });
  const session = await createSession(user.id, org.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Magic Byte Verification Against Spoofed Binaries
    // ------------------------------------------------------------------------
    await t.test("1. Rejects executable binaries disguised as spreadsheets (PE / ELF / PDF)", () => {
      // Fake Windows Executable disguised as CSV
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const resPE = validateFileBuffer(peBuffer, "malware.csv");
      assert.strictEqual(resPE.valid, false);
      assert.ok(resPE.error?.includes("PE/MZ magic header"));

      // Fake Linux ELF Binary disguised as XLSX
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const resELF = validateFileBuffer(elfBuffer, "exploit.xlsx");
      assert.strictEqual(resELF.valid, false);
      assert.ok(resELF.error?.includes("ELF magic header"));

      // Fake PDF document disguised as XLSX
      const pdfBuffer = Buffer.from("%PDF-1.4 Fake PDF Content");
      const resPDF = validateFileBuffer(pdfBuffer, "financials.xlsx");
      assert.strictEqual(resPDF.valid, false);
      assert.ok(resPDF.error?.includes("PDF document uploaded"));

      // Corrupted XLSX (missing PK ZIP header)
      const fakeZipBuffer = Buffer.from("Not a real zip archive file at all");
      const resZip = validateFileBuffer(fakeZipBuffer, "corrupt.xlsx");
      assert.strictEqual(resZip.valid, false);
      assert.ok(resZip.error?.includes("PK Zip magic header"));

      // Binary data with null bytes disguised as CSV
      const nullBuffer = Buffer.from("Col1,Col2\nVal1,\x00\x01\x02\x03");
      const resNull = validateFileBuffer(nullBuffer, "binary_stream.csv");
      assert.strictEqual(resNull.valid, false);
      assert.ok(resNull.error?.includes("null bytes"));

      // Valid plain text CSV
      const validCsvBuffer = Buffer.from("Date,Revenue,Units\n2026-01-01,15000,50\n2026-01-02,18500,62\n");
      const resCsv = validateFileBuffer(validCsvBuffer, "valid_sales.csv");
      assert.strictEqual(resCsv.valid, true);
      assert.strictEqual(resCsv.fileType, "CSV");

      // Valid XLSX header (PK\x03\x04)
      const validXlsxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
      const resXlsx = validateFileBuffer(validXlsxHeader, "valid_sheet.xlsx");
      assert.strictEqual(resXlsx.valid, true);
      assert.strictEqual(resXlsx.fileType, "XLSX");
    });

    // ------------------------------------------------------------------------
    // TEST 2: Formula Injection Detection & Profiler Sanitization
    // ------------------------------------------------------------------------
    await t.test("2. Detects formula injections during profiling and sanitizes metadata", () => {
      const rows = [
        { Date: "2026-01-01", Product: "Clean Item", Price: 100 },
        { Date: "2026-01-02", Product: "=cmd|' /C calc'!A0", Price: 120 },
        { Date: "2026-01-03", Product: "@SUM(1+1)", Price: 110 },
        { Date: "2026-01-04", Product: "+12345", Price: 130 },
      ];

      const profile = profileDataset(rows);
      assert.strictEqual(profile.rowCount, 4);

      // Verify formula injection was flagged in issues
      const injectionIssue = profile.issues.find((i) => i.code === "FORMULA_INJECTION_DETECTED");
      assert.ok(injectionIssue, "Must flag FORMULA_INJECTION_DETECTED in profiling issues");
      assert.strictEqual(injectionIssue.column, "Product");

      // Verify sample values stored in column metadata are sanitized with leading quote
      const prodCol = profile.columns.find((c) => c.name === "Product");
      assert.ok(prodCol);
      assert.ok(prodCol.sampleValues.includes("'=cmd|' /C calc'!A0"));
      assert.ok(prodCol.sampleValues.includes("'@SUM(1+1)"));
      assert.ok(prodCol.sampleValues.includes("'+12345"));
    });

    // ------------------------------------------------------------------------
    // TEST 3: Full Ingestion Route Rejection of Malicious File
    // ------------------------------------------------------------------------
    await t.test("3. Upload API rejects malicious binary with HTTP 415", async () => {
      const boundary = "----WebKitFormBoundaryTest123";
      const peFileContent = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // PE magic

      const formData = new FormData();
      formData.append("name", "Fake Spreadsheet");
      formData.append("file", new Blob([peFileContent], { type: "application/octet-stream" }), "malware.csv");

      const req = new NextRequest(new URL("http://localhost:3000/api/datasets/upload"), {
        method: "POST",
        headers: new Headers({
          cookie: `uwork_session=${session.rawToken}`,
        }),
        body: formData,
      });

      const res = await uploadDataset(req);
      assert.strictEqual(res.status, 415, "Must reject spoofed binary with HTTP 415 Unsupported Media Type");
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error?.message?.includes("Windows executable/binary detected"));
    });

    // ------------------------------------------------------------------------
    // TEST 4: Full Ingestion Route Rejection of Empty File & Cleanup
    // ------------------------------------------------------------------------
    await t.test("4. Upload API rejects empty dataset with HTTP 400 and purges storage", async () => {
      const emptyCsv = Buffer.from(""); // 0 bytes

      const formData = new FormData();
      formData.append("name", "Empty Dataset");
      formData.append("file", new Blob([emptyCsv], { type: "text/csv" }), "empty.csv");

      const req = new NextRequest(new URL("http://localhost:3000/api/datasets/upload"), {
        method: "POST",
        headers: new Headers({
          cookie: `uwork_session=${session.rawToken}`,
        }),
        body: formData,
      });

      const res = await uploadDataset(req);
      assert.strictEqual(res.status, 415, "0-byte file rejected by validation");
    });

    // ------------------------------------------------------------------------
    // TEST 5: Successful Ingestion of Valid CSV with Profiling
    // ------------------------------------------------------------------------
    await t.test("5. Successfully ingests, profiles, and audits valid CSV dataset", async () => {
      const validCsv = Buffer.from(
        "Date,Revenue,Units,Region\n2026-01-01,15000,25,North\n2026-01-02,18500,31,South\n2026-01-03,21000,35,East\n"
      );

      const formData = new FormData();
      formData.append("name", "Q1 Live Sales Records");
      formData.append("description", "Valid test sales dataset");
      formData.append("file", new Blob([validCsv], { type: "text/csv" }), "q1_sales.csv");

      const req = new NextRequest(new URL("http://localhost:3000/api/datasets/upload"), {
        method: "POST",
        headers: new Headers({
          cookie: `uwork_session=${session.rawToken}`,
        }),
        body: formData,
      });

      const res = await uploadDataset(req);
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.rowCount, 3);
      assert.strictEqual(data.data.columnCount, 4);
      assert.ok(data.data.datasetId);

      // Verify dataset in database
      const dbDataset = await prisma.dataset.findUnique({
        where: { id: data.data.datasetId },
        include: { versions: { include: { columns: true } } },
      });
      assert.ok(dbDataset);
      assert.strictEqual(dbDataset.organizationId, org.id);
      assert.strictEqual(dbDataset.versions[0].rowCount, 3);

      // Verify DATASET_UPLOADED audit log
      const audit = await prisma.auditLog.findFirst({
        where: { resourceId: data.data.datasetId, action: "DATASET_UPLOADED" },
      });
      assert.ok(audit, "Must log DATASET_UPLOADED audit event");
    });

  } finally {
    // Cleanup test data
    await prisma.notification.deleteMany({ where: { organizationId: org.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.dataset.deleteMany({ where: { organizationId: org.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
  }
});
