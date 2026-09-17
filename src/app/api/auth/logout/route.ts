import { NextRequest } from "next/server";
import { invalidateSession } from "@/lib/auth/session";
import { successResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("uwork_session")?.value;
  if (token) {
    await invalidateSession(token);
  }

  const response = successResponse({ message: "Successfully logged out." });
  response.cookies.set("uwork_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

