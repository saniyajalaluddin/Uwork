import { NextResponse } from "next/server";
import { runCanaryDiagnostics } from "@/services/health.service";

export async function GET() {
  try {
    const report = await runCanaryDiagnostics();
    return NextResponse.json(report, { status: report.httpStatusCode });
  } catch (error: any) {
    return NextResponse.json(
      {
        overallStatus: "UNHEALTHY",
        httpStatusCode: 503,
        timestamp: new Date().toISOString(),
        error: error.message || "Canary diagnostics failed unexpectedly",
      },
      { status: 503 }
    );
  }
}

