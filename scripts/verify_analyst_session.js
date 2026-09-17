const http = require("http");

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log("=== STEP 1: Check /api/health ===");
  const health = await request("/api/health");
  console.log("Health status code:", health.status, "body:", health.body);

  console.log("\n=== STEP 2: Login as analyst@apex.com ===");
  const loginRes = await request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ email: "analyst@apex.com", password: "Password123!" })
  );
  console.log("Login HTTP Status:", loginRes.status);
  console.log("Login User:", loginRes.body?.data?.user);

  const cookieHeader = loginRes.headers["set-cookie"];
  const sessionCookie = cookieHeader ? cookieHeader[0].split(";")[0] : "";
  console.log("Acquired Session Cookie:", sessionCookie ? "YES" : "NO");

  const authHeaders = {
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  };

  console.log("\n=== STEP 3: GET /api/auth/me ===");
  const me = await request("/api/auth/me", { headers: authHeaders });
  console.log("Auth/me Status:", me.status);
  console.log("Auth/me Data:", JSON.stringify(me.body?.data, null, 2));

  console.log("\n=== STEP 4: GET /api/analytics/overview ===");
  const overview = await request("/api/analytics/overview", { headers: authHeaders });
  console.log("Overview Status:", overview.status);
  console.log("Overview KPIs:", overview.body?.data?.kpis);
  console.log("Overview TopProducts count:", overview.body?.data?.topProducts?.length);
  console.log("Overview TopRegions count:", overview.body?.data?.topRegions?.length);
  console.log("Overview DecisionItems count:", overview.body?.data?.decisionItems?.length);
  console.log("Overview Anomalies count:", overview.body?.data?.recentAnomalies?.length);

  console.log("\n=== STEP 5: GET /api/org/members (as Analyst) ===");
  const members = await request("/api/org/members", { headers: authHeaders });
  console.log("Members Status:", members.status);
  console.log("Members count:", members.body?.data?.members?.length);
  if (members.body?.data?.members) {
    members.body.data.members.forEach((m) => {
      console.log(` - ${m.name} (${m.email}) [Role: ${m.role}] isCurrent: ${m.isCurrentUser}`);
    });
  }

  console.log("\n=== STEP 6: GET /api/org/benefits (as Analyst) ===");
  const benefits = await request("/api/org/benefits", { headers: authHeaders });
  console.log("Benefits Status:", benefits.status);
  console.log("Plan:", benefits.body?.data?.benefits?.planName, "SLA:", benefits.body?.data?.benefits?.quotas?.sla);

  console.log("\n=== STEP 7: GET /api/user/profile ===");
  const profile = await request("/api/user/profile", { headers: authHeaders });
  console.log("Profile Status:", profile.status);
  console.log("Profile User:", profile.body?.data?.user?.firstName, profile.body?.data?.user?.lastName, "Role:", profile.body?.data?.role);

  console.log("\n=== STEP 8: Render Overview & Settings HTML pages ===");
  const overviewHtml = await request("/overview", { headers: authHeaders });
  console.log("/overview HTML status:", overviewHtml.status);

  const settingsHtml = await request("/settings", { headers: authHeaders });
  console.log("/settings HTML status:", settingsHtml.status);

  console.log("\n=== ALL VERIFICATIONS COMPLETE ===");
}

main().catch(console.error);

