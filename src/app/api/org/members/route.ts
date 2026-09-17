import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, requireAuth } from "@/lib/api/middleware";
import { hashPassword } from "@/lib/auth/password";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isActive: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  const formatted = members.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    email: m.user.email,
    name: `${m.user.firstName} ${m.user.lastName}`,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    role: m.role,
    joinedAt: m.joinedAt,
    isActive: m.user.isActive,
    isCurrentUser: m.userId === auth.context.user.id,
  }));

  return successResponse({ members: formatted });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { email, firstName, lastName, role = "ANALYST" } = body;

    if (!email || !firstName || !lastName) {
      return errorResponse("Email, first name, and last name are required.", 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Create user with randomized initial password
      const tempPasswordHash = await hashPassword("TempPass2026!#" + Date.now());
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          passwordHash: tempPasswordHash,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    // Check if already a member of this organization
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      return errorResponse("User is already a member of this organization.", 409);
    }

    // Create membership
    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: ["ADMIN", "ANALYST", "VIEWER"].includes(role) ? role : "ANALYST",
      },
      include: {
        user: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.context.user.id,
        action: "MEMBER_INVITED",
        resourceType: "MEMBER",
        resourceId: membership.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ invitedEmail: user.email, assignedRole: role }),
      },
    });

    return successResponse({
      membershipId: membership.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: membership.role,
      joinedAt: membership.joinedAt,
    });
  } catch (err: any) {
    console.error("Invite member error:", err);
    return errorResponse("Failed to invite member.", 500);
  }
}

