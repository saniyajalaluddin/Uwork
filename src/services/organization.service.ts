import crypto from "crypto";
import { prisma } from "../lib/db/prisma";
import { logAuditEvent } from "./audit.service";
import { eventBus } from "../lib/events/event-bus";
import { Role } from "../lib/security/rbac";

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateInvitationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(rawToken);
  return { rawToken, tokenHash };
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role?: string;
  invitedById: string;
  expiresInDays?: number;
}

export interface VerifyInvitationResult {
  valid: boolean;
  reason?: "NOT_FOUND" | "EXPIRED" | "ALREADY_ACCEPTED" | "REVOKED";
  invitationId?: string;
  email?: string;
  role?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  expiresAt?: string;
}

/**
 * Creates a cryptographically secure, expiring organization invitation.
 */
export async function createInvitation(input: CreateInvitationInput) {
  const { organizationId, email, role = "ANALYST", invitedById, expiresInDays = 7 } = input;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Invalid email address format.");
  }

  const validRoles: Role[] = ["ADMIN", "ANALYST", "VIEWER"];
  if (!validRoles.includes(role as Role)) {
    throw new Error(`Invalid role '${role}'. Invitations can only assign ADMIN, ANALYST, or VIEWER.`);
  }

  // Check if organization exists
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  // Check if user with this email is already a member of this organization
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        where: { organizationId },
      },
    },
  });

  if (existingUser && existingUser.memberships.length > 0) {
    throw new Error("User is already an active member of this organization.");
  }

  // Check if there is an existing pending invitation for this email in this org
  const existingInvite = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId,
      email: normalizedEmail,
      status: "PENDING",
    },
  });

  const { rawToken, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  let invitation;
  if (existingInvite) {
    // Refresh existing pending invitation with new token and extended expiry
    invitation = await prisma.organizationInvitation.update({
      where: { id: existingInvite.id },
      data: {
        tokenHash,
        role,
        invitedById,
        expiresAt,
        status: "PENDING",
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  } else {
    invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        role,
        tokenHash,
        invitedById,
        expiresAt,
        status: "PENDING",
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  await logAuditEvent({
    organizationId,
    userId: invitedById,
    action: "INVITATION_CREATED",
    resourceType: "INVITATION",
    resourceId: invitation.id,
    metadata: {
      invitedEmail: normalizedEmail,
      assignedRole: role,
      expiresAt: expiresAt.toISOString(),
    },
  });

  eventBus.publishToTenant(organizationId, "MEMBER_UPDATED", {
    action: "INVITATION_CREATED",
    invitationId: invitation.id,
    email: normalizedEmail,
  });

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      organization: invitation.organization,
      invitedBy: invitation.invitedBy,
    },
    rawToken,
    invitationLink: `/invite/accept?token=${rawToken}`,
  };
}

/**
 * Lists all invitations for an organization, automatically expiring stale items.
 */
export async function listInvitations(organizationId: string) {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      invitedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const now = new Date();
  const results = [];

  for (const inv of invitations) {
    let currentStatus = inv.status;
    if (currentStatus === "PENDING" && inv.expiresAt < now) {
      currentStatus = "EXPIRED";
      await prisma.organizationInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
    }

    results.push({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: currentStatus,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      invitedBy: inv.invitedBy
        ? `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`
        : "Unknown",
    });
  }

  return results;
}

/**
 * Revokes a pending invitation with IDOR check and audit log.
 */
export async function revokeInvitation(input: {
  organizationId: string;
  invitationId: string;
  userId: string;
}) {
  const { organizationId, invitationId, userId } = input;

  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId },
  });

  if (!invitation) {
    throw new Error("Invitation not found in this organization.");
  }

  if (invitation.status !== "PENDING") {
    throw new Error(`Cannot revoke invitation with status '${invitation.status}'.`);
  }

  const updated = await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "INVITATION_REVOKED",
    resourceType: "INVITATION",
    resourceId: updated.id,
    metadata: { revokedEmail: updated.email },
  });

  eventBus.publishToTenant(organizationId, "MEMBER_UPDATED", {
    action: "INVITATION_REVOKED",
    invitationId: updated.id,
  });

  return updated;
}

/**
 * Verifies an invitation token without modifying database state.
 */
export async function verifyInvitation(rawToken: string): Promise<VerifyInvitationResult> {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false, reason: "NOT_FOUND" };
  }

  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!invitation) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  if (invitation.status === "REVOKED") {
    return { valid: false, reason: "REVOKED" };
  }

  if (invitation.status === "ACCEPTED") {
    return { valid: false, reason: "ALREADY_ACCEPTED" };
  }

  if (invitation.expiresAt < new Date()) {
    if (invitation.status === "PENDING") {
      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    return { valid: false, reason: "EXPIRED" };
  }

  return {
    valid: true,
    invitationId: invitation.id,
    email: invitation.email,
    role: invitation.role,
    organizationId: invitation.organization.id,
    organizationName: invitation.organization.name,
    organizationSlug: invitation.organization.slug,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/**
 * Accepts an invitation and binds the authenticated user into the organization.
 */
export async function acceptInvitation(input: {
  rawToken: string;
  userId: string;
}) {
  const { rawToken, userId } = input;

  const verification = await verifyInvitation(rawToken);
  if (!verification.valid || !verification.invitationId) {
    throw new Error(`Invitation is invalid: ${verification.reason || "NOT_FOUND"}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new Error("User not found.");
  }

  // Enforce that accepting user's email matches the invited email
  if (user.email.toLowerCase() !== verification.email?.toLowerCase()) {
    throw new Error(
      `Invitation was issued for '${verification.email}', but current user is '${user.email}'.`
    );
  }

  const orgId = verification.organizationId!;

  // Check if already a member
  const existingMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: user.id,
      },
    },
  });

  if (existingMember) {
    // Mark invitation accepted even if already member
    await prisma.organizationInvitation.update({
      where: { id: verification.invitationId },
      data: { status: "ACCEPTED" },
    });
    return {
      membershipId: existingMember.id,
      organizationId: orgId,
      role: existingMember.role,
      alreadyMember: true,
    };
  }

  // Create membership and accept invitation transactionally
  const [membership] = await prisma.$transaction([
    prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: verification.role || "ANALYST",
      },
    }),
    prisma.organizationInvitation.update({
      where: { id: verification.invitationId },
      data: { status: "ACCEPTED" },
    }),
  ]);

  await logAuditEvent({
    organizationId: orgId,
    userId: user.id,
    action: "INVITATION_ACCEPTED",
    resourceType: "INVITATION",
    resourceId: verification.invitationId,
    metadata: {
      acceptedByEmail: user.email,
      role: membership.role,
      membershipId: membership.id,
    },
  });

  eventBus.publishToTenant(orgId, "MEMBER_UPDATED", {
    action: "INVITATION_ACCEPTED",
    userId: user.id,
    role: membership.role,
  });

  return {
    membershipId: membership.id,
    organizationId: orgId,
    role: membership.role,
    alreadyMember: false,
  };
}

/**
 * Updates organization profile details with slug conflict prevention.
 */
export async function updateOrganizationDetails(input: {
  organizationId: string;
  userId: string;
  name?: string;
  slug?: string;
  logoUrl?: string;
}) {
  const { organizationId, userId, name, slug, logoUrl } = input;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  const updateData: { name?: string; slug?: string; logoUrl?: string | null } = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      throw new Error("Organization name must be between 2 and 100 characters.");
    }
    updateData.name = trimmed;
  }

  if (slug !== undefined) {
    const normalizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/--+/g, "-");
    if (normalizedSlug.length < 2 || normalizedSlug.length > 50) {
      throw new Error("Organization slug must be between 2 and 50 characters (letters, numbers, hyphens).");
    }

    // Check slug collision
    const existingConflict = await prisma.organization.findFirst({
      where: {
        slug: normalizedSlug,
        id: { not: organizationId },
      },
    });
    if (existingConflict) {
      throw new Error(`Organization slug '${normalizedSlug}' is already taken.`);
    }

    updateData.slug = normalizedSlug;
  }

  if (logoUrl !== undefined) {
    updateData.logoUrl = logoUrl;
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: updateData,
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "ORGANIZATION_UPDATED",
    resourceType: "ORGANIZATION",
    resourceId: organizationId,
    metadata: {
      previous: { name: org.name, slug: org.slug },
      updated: updateData,
    },
  });

  eventBus.publishToTenant(organizationId, "ORGANIZATION_UPDATED", {
    name: updated.name,
    slug: updated.slug,
  });

  return updated;
}

/**
 * Safely deletes an organization with strict owner authorization and confirmation checks.
 */
export async function deleteOrganizationSafe(input: {
  organizationId: string;
  requestingUserId: string;
  requestingUserRole: string;
  confirmationSlug: string;
}) {
  const { organizationId, requestingUserId, requestingUserRole, confirmationSlug } = input;

  if (requestingUserRole !== "OWNER") {
    throw new Error("Only the Organization Owner has authority to delete this organization.");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  if (confirmationSlug !== org.slug) {
    throw new Error(`Confirmation slug '${confirmationSlug}' does not match organization slug '${org.slug}'.`);
  }

  await logAuditEvent({
    organizationId,
    userId: requestingUserId,
    action: "ORGANIZATION_DELETED",
    resourceType: "ORGANIZATION",
    resourceId: organizationId,
    metadata: { orgName: org.name, orgSlug: org.slug },
  });

  await prisma.organization.delete({
    where: { id: organizationId },
  });

  return {
    success: true,
    deletedOrganizationId: organizationId,
  };
}

/**
 * Updates a member's role with comprehensive privilege escalation guards.
 */
export async function updateMemberRoleSafe(input: {
  organizationId: string;
  requestingUserId: string;
  requestingUserRole: string;
  targetMembershipId: string;
  newRole: string;
}) {
  const { organizationId, requestingUserId, requestingUserRole, targetMembershipId, newRole } = input;

  const validRoles: Role[] = ["OWNER", "ADMIN", "ANALYST", "VIEWER"];
  if (!validRoles.includes(newRole as Role)) {
    throw new Error(`Invalid role '${newRole}'.`);
  }

  const target = await prisma.organizationMember.findFirst({
    where: { id: targetMembershipId, organizationId },
    include: { user: true },
  });

  if (!target) {
    throw new Error("Member not found in this organization.");
  }

  // 1. Role Privilege Escalation: Non-owners cannot grant OWNER role
  if (newRole === "OWNER" && requestingUserRole !== "OWNER") {
    throw new Error("Privilege Escalation Detected: Only an existing Owner can grant the OWNER role.");
  }

  // 2. Non-owners cannot modify an existing OWNER's role
  if (target.role === "OWNER" && requestingUserRole !== "OWNER") {
    throw new Error("Only an Organization Owner can modify another Owner's role.");
  }

  // 3. Sole Owner Protection: Cannot demote the last owner
  if (target.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await prisma.organizationMember.count({
      where: { organizationId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new Error("Cannot demote the sole organization Owner. Transfer ownership first.");
    }
  }

  const updated = await prisma.organizationMember.update({
    where: { id: target.id },
    data: { role: newRole },
    include: { user: true },
  });

  await logAuditEvent({
    organizationId,
    userId: requestingUserId,
    action: "MEMBER_ROLE_UPDATED",
    resourceType: "MEMBER",
    resourceId: updated.id,
    metadata: {
      targetEmail: updated.user.email,
      previousRole: target.role,
      newRole,
    },
  });

  eventBus.publishToTenant(organizationId, "MEMBER_UPDATED", {
    action: "MEMBER_ROLE_UPDATED",
    membershipId: updated.id,
    newRole,
  });

  return {
    membershipId: updated.id,
    userId: updated.userId,
    email: updated.user.email,
    name: `${updated.user.firstName} ${updated.user.lastName}`,
    role: updated.role,
  };
}

/**
 * Removes a member from an organization with sole-owner and non-owner protections.
 */
export async function removeMemberSafe(input: {
  organizationId: string;
  requestingUserId: string;
  requestingUserRole: string;
  targetMembershipId: string;
}) {
  const { organizationId, requestingUserId, requestingUserRole, targetMembershipId } = input;

  const target = await prisma.organizationMember.findFirst({
    where: { id: targetMembershipId, organizationId },
    include: { user: true },
  });

  if (!target) {
    throw new Error("Member not found in this organization.");
  }

  // 1. Non-owners cannot remove an OWNER
  if (target.role === "OWNER" && requestingUserRole !== "OWNER") {
    throw new Error("Only an Organization Owner can remove an Owner.");
  }

  // 2. Sole Owner Protection
  if (target.role === "OWNER") {
    const ownerCount = await prisma.organizationMember.count({
      where: { organizationId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new Error("Cannot remove the sole organization Owner.");
    }
  }

  await prisma.organizationMember.delete({
    where: { id: target.id },
  });

  await logAuditEvent({
    organizationId,
    userId: requestingUserId,
    action: "MEMBER_REMOVED",
    resourceType: "MEMBER",
    resourceId: target.id,
    metadata: {
      removedEmail: target.user.email,
      removedRole: target.role,
    },
  });

  eventBus.publishToTenant(organizationId, "MEMBER_UPDATED", {
    action: "MEMBER_REMOVED",
    membershipId: target.id,
  });

  return {
    success: true,
    removedEmail: target.user.email,
  };
}
