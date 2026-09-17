import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const keys = await prisma.aPIKey.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });

  const formatted = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes.split(","),
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
  }));

  return successResponse({ apiKeys: formatted });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { name = "Default API Key", scopes = "read,write" } = body;

    const rawSecret = `${AppConfig.auth.apiKeyPrefix}${crypto.randomBytes(24).toString("hex")}`;
    const keyPrefix = `${rawSecret.substring(0, 12)}...${rawSecret.substring(rawSecret.length - 4)}`;
    const keyHash = crypto.createHash("sha256").update(rawSecret).digest("hex");

    const apiKey = await prisma.aPIKey.create({
      data: {
        organizationId: orgId,
        name: String(name).trim(),
        keyPrefix,
        keyHash,
        scopes: Array.isArray(scopes) ? scopes.join(",") : scopes,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.context.user.id,
        action: "API_KEY_CREATED",
        resourceType: "API_KEY",
        resourceId: apiKey.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ keyName: apiKey.name, prefix: keyPrefix }),
      },
    });

    // Return the raw secret only once upon creation
    return successResponse({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      rawSecret,
      scopes: apiKey.scopes.split(","),
      createdAt: apiKey.createdAt,
    });
  } catch (err: any) {
    return errorResponse("Failed to create API key.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("API Key ID is required.", 400);
  }

  const existing = await prisma.aPIKey.findFirst({
    where: { id, organizationId: orgId },
  });

  if (!existing) {
    return errorResponse("API key not found.", 404);
  }

  await prisma.aPIKey.delete({ where: { id: existing.id } });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      userId: auth.context.user.id,
      action: "API_KEY_REVOKED",
      resourceType: "API_KEY",
      resourceId: id,
      status: "SUCCESS",
      metadataJson: JSON.stringify({ keyPrefix: existing.keyPrefix }),
    },
  });

  return successResponse({ message: "API key successfully revoked." });
}

