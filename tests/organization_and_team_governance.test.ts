import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  verifyInvitation,
  acceptInvitation,
  updateOrganizationDetails,
  updateMemberRoleSafe,
  removeMemberSafe,
  hashInvitationToken,
} from "../src/services/organization.service";
import {
  GET as orgGetRoute,
  PATCH as orgPatchRoute,
} from "../src/app/api/org/route";
import {
  GET as invitationsGetRoute,
  POST as invitationsPostRoute,
  DELETE as invitationsDeleteRoute,
} from "../src/app/api/org/invitations/route";
import {
  PATCH as memberPatchRoute,
  DELETE as memberDeleteRoute,
} from "../src/app/api/org/members/[id]/route";
import { NextRequest } from "next/server";

test("Phase 18: Organization Management, Invitations & Team Governance", async (t) => {
  const timestamp = Date.now();

  // Setup Tenant Alpha
  const orgA = await prisma.organization.create({
    data: {
      name: `Governance Corp Alpha ${timestamp}`,
      slug: `gov-alpha-${timestamp}`,
      planTier: "ENTERPRISE",
    },
  });

  const ownerA = await prisma.user.create({
    data: {
      email: `owner_a_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Owner",
      lastName: "Alpha",
    },
  });

  const adminA = await prisma.user.create({
    data: {
      email: `admin_a_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Admin",
      lastName: "Alpha",
    },
  });

  const viewerA = await prisma.user.create({
    data: {
      email: `viewer_a_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Viewer",
      lastName: "Alpha",
    },
  });

  const ownerMemberA = await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: ownerA.id, role: "OWNER" },
  });

  const adminMemberA = await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: adminA.id, role: "ADMIN" },
  });

  const viewerMemberA = await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: viewerA.id, role: "VIEWER" },
  });

  const sessionOwnerA = await createSession(ownerA.id, orgA.id);
  const sessionAdminA = await createSession(adminA.id, orgA.id);
  const sessionViewerA = await createSession(viewerA.id, orgA.id);

  // Setup Tenant Beta (for IDOR attack tests)
  const orgB = await prisma.organization.create({
    data: {
      name: `Governance Corp Beta ${timestamp}`,
      slug: `gov-beta-${timestamp}`,
      planTier: "GROWTH",
    },
  });

  const ownerB = await prisma.user.create({
    data: {
      email: `owner_b_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Owner",
      lastName: "Beta",
    },
  });

  const ownerMemberB = await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: ownerB.id, role: "OWNER" },
  });

  const sessionOwnerB = await createSession(ownerB.id, orgB.id);

  await t.test("1. Cryptographic invitation token generation, SHA-256 hashing, and verification", async () => {
    const inviteEmail = `invited_lead_${timestamp}@example.com`;

    const res = await createInvitation({
      organizationId: orgA.id,
      email: inviteEmail,
      role: "ANALYST",
      invitedById: adminA.id,
      expiresInDays: 7,
    });

    assert.ok(res.rawToken, "Must return a raw cryptographic token");
    assert.strictEqual(res.rawToken.length, 64, "Raw token must be 64-character hex (32 bytes)");
    assert.strictEqual(res.invitation.email, inviteEmail);
    assert.strictEqual(res.invitation.role, "ANALYST");
    assert.strictEqual(res.invitation.status, "PENDING");

    // Verify token is hashed with SHA-256 in database (raw token is never stored)
    const dbRecord = await prisma.organizationInvitation.findUnique({
      where: { id: res.invitation.id },
    });
    assert.ok(dbRecord, "Invitation must exist in database");
    assert.notStrictEqual(dbRecord.tokenHash, res.rawToken, "Database must NOT store raw token");
    assert.strictEqual(
      dbRecord.tokenHash,
      hashInvitationToken(res.rawToken),
      "Database must store SHA-256 digest of raw token"
    );

    // Verify invitation resolution
    const verified = await verifyInvitation(res.rawToken);
    assert.strictEqual(verified.valid, true, "Valid raw token must verify successfully");
    assert.strictEqual(verified.email, inviteEmail);
    assert.strictEqual(verified.organizationName, orgA.name);
    assert.strictEqual(verified.role, "ANALYST");

    // Corrupted / tampered token verification
    const tampered = await verifyInvitation("deadbeefdeadbeef" + res.rawToken.slice(16));
    assert.strictEqual(tampered.valid, false, "Tampered token must fail verification");
    assert.strictEqual(tampered.reason, "NOT_FOUND");
  });

  await t.test("2. Invitation acceptance workflow, email validation, and replay prevention", async () => {
    const candidateEmail = `candidate_${timestamp}@example.com`;
    const candidateUser = await prisma.user.create({
      data: {
        email: candidateEmail,
        passwordHash: "dummy_pass_hash",
        firstName: "Candidate",
        lastName: "Smith",
      },
    });

    const inviteResult = await createInvitation({
      organizationId: orgA.id,
      email: candidateEmail,
      role: "ANALYST",
      invitedById: ownerA.id,
      expiresInDays: 7,
    });

    // Mismatched user acceptance defense
    const alienUser = await prisma.user.create({
      data: {
        email: `alien_imposter_${timestamp}@example.com`,
        passwordHash: "dummy_pass_hash",
        firstName: "Alien",
        lastName: "Imposter",
      },
    });

    await assert.rejects(
      async () => {
        await acceptInvitation({
          rawToken: inviteResult.rawToken,
          userId: alienUser.id,
        });
      },
      /Invitation was issued for/,
      "Must reject invitation claim if user email does not match invited recipient"
    );

    // Legitimate candidate acceptance
    const acceptResult = await acceptInvitation({
      rawToken: inviteResult.rawToken,
      userId: candidateUser.id,
    });

    assert.strictEqual(acceptResult.organizationId, orgA.id);
    assert.strictEqual(acceptResult.role, "ANALYST");
    assert.strictEqual(acceptResult.alreadyMember, false);

    // Verify user is now an active member
    const newMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgA.id,
          userId: candidateUser.id,
        },
      },
    });
    assert.ok(newMembership, "Candidate must be recorded in organization members");
    assert.strictEqual(newMembership.role, "ANALYST");

    // Token replay defense: Cannot accept the same invitation twice
    await assert.rejects(
      async () => {
        await acceptInvitation({
          rawToken: inviteResult.rawToken,
          userId: candidateUser.id,
        });
      },
      /ALREADY_ACCEPTED/,
      "Replayed token must be rejected"
    );
  });

  await t.test("3. Role privilege escalation defense and sole owner protections", async () => {
    // 1. ADMIN cannot promote anyone to OWNER
    await assert.rejects(
      async () => {
        await updateMemberRoleSafe({
          organizationId: orgA.id,
          requestingUserId: adminA.id,
          requestingUserRole: "ADMIN",
          targetMembershipId: viewerMemberA.id,
          newRole: "OWNER",
        });
      },
      /Privilege Escalation Detected/,
      "Admin must be blocked from granting the OWNER role"
    );

    // 2. ADMIN cannot demote an OWNER
    await assert.rejects(
      async () => {
        await updateMemberRoleSafe({
          organizationId: orgA.id,
          requestingUserId: adminA.id,
          requestingUserRole: "ADMIN",
          targetMembershipId: ownerMemberA.id,
          newRole: "ADMIN",
        });
      },
      /Only an Organization Owner can modify another Owner's role/,
      "Admin must not be allowed to modify an Owner"
    );

    // 3. ADMIN cannot remove an OWNER
    await assert.rejects(
      async () => {
        await removeMemberSafe({
          organizationId: orgA.id,
          requestingUserId: adminA.id,
          requestingUserRole: "ADMIN",
          targetMembershipId: ownerMemberA.id,
        });
      },
      /Only an Organization Owner can remove an Owner/,
      "Admin must not be allowed to remove an Owner"
    );

    // 4. Sole OWNER cannot demote themselves without transferring ownership
    await assert.rejects(
      async () => {
        await updateMemberRoleSafe({
          organizationId: orgA.id,
          requestingUserId: ownerA.id,
          requestingUserRole: "OWNER",
          targetMembershipId: ownerMemberA.id,
          newRole: "ADMIN",
        });
      },
      /Cannot demote the sole organization Owner/,
      "Sole Owner cannot demote self without another Owner in place"
    );

    // 5. Sole OWNER cannot remove themselves
    await assert.rejects(
      async () => {
        await removeMemberSafe({
          organizationId: orgA.id,
          requestingUserId: ownerA.id,
          requestingUserRole: "OWNER",
          targetMembershipId: ownerMemberA.id,
        });
      },
      /Cannot remove the sole organization Owner/,
      "Sole Owner cannot be removed"
    );

    // 6. Legitimate role transition by ADMIN from VIEWER to ANALYST succeeds
    const updatedViewer = await updateMemberRoleSafe({
      organizationId: orgA.id,
      requestingUserId: adminA.id,
      requestingUserRole: "ADMIN",
      targetMembershipId: viewerMemberA.id,
      newRole: "ANALYST",
    });
    assert.strictEqual(updatedViewer.role, "ANALYST");
  });

  await t.test("4. Organization profile updating and slug collision prevention", async () => {
    // Legitimate update by Owner
    const updatedOrg = await updateOrganizationDetails({
      organizationId: orgA.id,
      userId: ownerA.id,
      name: `Acme Super Alpha ${timestamp}`,
      slug: `acme-alpha-${timestamp}`,
    });
    assert.strictEqual(updatedOrg.name, `Acme Super Alpha ${timestamp}`);
    assert.strictEqual(updatedOrg.slug, `acme-alpha-${timestamp}`);

    // Slug collision attempt: Try to rename Org A to Org B's existing slug
    await assert.rejects(
      async () => {
        await updateOrganizationDetails({
          organizationId: orgA.id,
          userId: ownerA.id,
          slug: orgB.slug,
        });
      },
      /already taken/,
      "Must prevent organization slug collision across tenants"
    );
  });

  await t.test("5. REST API: RBAC enforcement, IDOR isolation, and invitation management", async () => {
    // A. GET /api/org returns active organization details
    const getReq = new NextRequest("http://localhost:3000/api/org", {
      headers: { cookie: `uwork_session=${sessionOwnerA.rawToken}` },
    });
    const getRes = await orgGetRoute(getReq);
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.data.organization.id, orgA.id);

    // B. VIEWER cannot create invitations (RBAC: 403 Forbidden)
    const viewerInviteReq = new NextRequest("http://localhost:3000/api/org/invitations", {
      method: "POST",
      headers: {
        cookie: `uwork_session=${sessionViewerA.rawToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: `viewer_attempt_${timestamp}@test.com` }),
    });
    const viewerInviteRes = await invitationsPostRoute(viewerInviteReq);
    assert.strictEqual(viewerInviteRes.status, 403, "Viewer must receive 403 Forbidden on invitation creation");

    // C. ADMIN creates invitation via API
    const adminInviteReq = new NextRequest("http://localhost:3000/api/org/invitations", {
      method: "POST",
      headers: {
        cookie: `uwork_session=${sessionAdminA.rawToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `api_candidate_${timestamp}@example.com`,
        role: "VIEWER",
      }),
    });
    const adminInviteRes = await invitationsPostRoute(adminInviteReq);
    const adminInviteData = await adminInviteRes.json();
    assert.strictEqual(adminInviteRes.status, 201);
    assert.ok(adminInviteData.data.invitation.id);
    const inviteIdA = adminInviteData.data.invitation.id;

    // D. Cross-Tenant IDOR Attack: Tenant Beta attempts to revoke Org A's invitation
    const idorRevokeReq = new NextRequest(`http://localhost:3000/api/org/invitations?id=${inviteIdA}`, {
      method: "DELETE",
      headers: { cookie: `uwork_session=${sessionOwnerB.rawToken}` },
    });
    const idorRevokeRes = await invitationsDeleteRoute(idorRevokeReq);
    assert.strictEqual(idorRevokeRes.status, 400, "Cross-tenant invitation revocation must fail");

    // E. Cross-Tenant IDOR Attack: Tenant Beta attempts to remove a member from Org A
    const idorMemberReq = new NextRequest(`http://localhost:3000/api/org/members/${adminMemberA.id}`, {
      method: "DELETE",
      headers: { cookie: `uwork_session=${sessionOwnerB.rawToken}` },
    });
    const idorMemberRes = await memberDeleteRoute(idorMemberReq, {
      params: Promise.resolve({ id: adminMemberA.id }),
    });
    assert.strictEqual(idorMemberRes.status, 404, "Cross-tenant member removal must return 404");
  });
});
