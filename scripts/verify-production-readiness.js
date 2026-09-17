#!/usr/bin/env node

/**
 * UWORK Production Readiness CLI Verification Tool
 * Runs comprehensive pre-flight verification across environments.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("===============================================================");
  console.log("  UWORK Enterprise BI — Production Readiness Preflight Check  ");
  console.log("===============================================================\n");

  let passed = true;

  // 1. Next.js Configuration Check
  console.log("1. Inspecting Next.js Security Configuration (next.config.js)...");
  try {
    const nextConfigPath = path.resolve(process.cwd(), "next.config.js");
    const content = fs.readFileSync(nextConfigPath, "utf8");
    if (
      content.includes("Content-Security-Policy") &&
      content.includes("X-Frame-Options") &&
      content.includes("Strict-Transport-Security")
    ) {
      console.log("   ✔ Security Headers (CSP, HSTS, X-Frame-Options) present in next.config.js");
    } else {
      console.error("   ❌ Missing required security headers in next.config.js");
      passed = false;
    }
  } catch (err) {
    console.error(`   ❌ Failed to inspect next.config.js: ${err.message}`);
    passed = false;
  }

  // 2. Storage Directory Permissions
  console.log("\n2. Validating Storage Directory Permissions...");
  const dirs = ["storage/uploads", "storage/reports", "storage/backups"];
  for (const d of dirs) {
    const absPath = path.resolve(process.cwd(), d);
    fs.mkdirSync(absPath, { recursive: true });
    const testFile = path.join(absPath, `.readiness_test_${Date.now()}`);
    fs.writeFileSync(testFile, "OK");
    fs.unlinkSync(testFile);
    console.log(`   ✔ ${d}: Directory exists and has write permissions`);
  }

  // 3. Database File Existence
  console.log("\n3. Validating SQLite Database Engine...");
  const dbPaths = [
    path.resolve(process.cwd(), "prisma", "uwork.db"),
    path.resolve(process.cwd(), "uwork.db"),
  ];
  const foundDb = dbPaths.find((p) => fs.existsSync(p));
  if (foundDb) {
    const size = (fs.statSync(foundDb).size / 1024).toFixed(1);
    console.log(`   ✔ Active SQLite database found at ${foundDb} (${size} KB)`);
  } else {
    console.error("   ❌ No active SQLite database file found.");
    passed = false;
  }

  // 4. Node.js Native SQLite Engine
  console.log("\n4. Checking Node.js Native SQLite Engine (node:sqlite)...");
  try {
    const { DatabaseSync } = require("node:sqlite");
    if (foundDb) {
      const db = new DatabaseSync(foundDb, { readOnly: true });
      const rows = db.prepare("PRAGMA integrity_check").all();
      db.close();
      if (rows.length > 0 && rows[0].integrity_check === "ok") {
        console.log("   ✔ PRAGMA integrity_check passed: 'ok'");
      } else {
        console.error("   ❌ PRAGMA integrity_check failed:", rows);
        passed = false;
      }
    }
  } catch (err) {
    console.error(`   ❌ node:sqlite error: ${err.message}`);
    passed = false;
  }

  console.log("\n===============================================================");
  if (passed) {
    console.log("  STATUS: ALL PRODUCTION READINESS CHECKS PASSED (100% GREEN)  ");
    console.log("===============================================================\n");
    process.exit(0);
  } else {
    console.log("  STATUS: ONE OR MORE CHECKS FAILED                             ");
    console.log("===============================================================\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error during readiness audit:", err);
  process.exit(1);
});

