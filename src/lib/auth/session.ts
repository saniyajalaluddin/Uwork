import crypto from "crypto";
import { prisma } from "../db/prisma";
import { AppConfig } from "../../config/app.config";

const SESSION_EXPIRY_DAYS = AppConfig.auth.sessionExpiryDays;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  organizationId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      activeOrganizationId: organizationId,
      tokenHash,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isActive: true,
        },
      },
      activeOrganization: {
        select: {
          id: true,
          name: true,
          slug: true,
          planTier: true,
        },
      },
    },
  });

  return { session, rawToken };
}

export async function validateSession(rawToken: string) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isActive: true,
        },
      },
      activeOrganization: {
        select: {
          id: true,
          name: true,
          slug: true,
          planTier: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  // Fetch membership role in active organization
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: session.activeOrganizationId,
        userId: session.userId,
      },
    },
  });

  if (!membership) {
    return null;
  }

  return {
    user: session.user,
    organization: session.activeOrganization,
    role: membership.role,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

export async function invalidateSession(rawToken: string) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}

