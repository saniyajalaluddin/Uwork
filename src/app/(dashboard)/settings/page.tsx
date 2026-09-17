"use client";

import React, { useState, useEffect } from "react";
import {
  User,
  Shield,
  Key,
  History,
  Users,
  Building,
  Lock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  HardDrive,
  Database,
  Sparkles,
  Server,
  Layers,
  Copy,
  Mail,
  Link2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Webhook,
  Bell,
  Send,
  RefreshCw,
  Activity,
  Radio,
  Download,
  FileJson,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "org" | "members" | "benefits" | "apikeys" | "webhooks" | "compliance" | "system" | "audit">("profile");

  // Compliance & Data Retention State
  const [retentionPolicies, setRetentionPolicies] = useState<{
    retentionAuditDays: number;
    retentionForecastDays: number;
    retentionJobDays: number;
  }>({
    retentionAuditDays: 365,
    retentionForecastDays: 180,
    retentionJobDays: 30,
  });
  const [retentionMessage, setRetentionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isCleaningRetention, setIsCleaningRetention] = useState(false);
  const [retentionCleanupResult, setRetentionCleanupResult] = useState<any | null>(null);

  // Data Export (Takeout) State
  const [dataExports, setDataExports] = useState<any[]>([]);
  const [isExportingData, setIsExportingData] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // GDPR Account Deletion State
  const [anonymizePassword, setAnonymizePassword] = useState("");
  const [anonymizeConfirmText, setAnonymizeConfirmText] = useState("");
  const [anonymizeMessage, setAnonymizeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);

  // System Canary & Automated Backups State (Phase 22)
  const [canaryReport, setCanaryReport] = useState<any | null>(null);
  const [isLoadingCanary, setIsLoadingCanary] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Profile State
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("ANALYST");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Organization & Governance State
  const [orgData, setOrgData] = useState<any>(null);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgMessage, setOrgMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState("");
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);

  // Members & Invitations State
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ANALYST");
  const [memberMessage, setMemberMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Webhooks & Integrations State
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["*"]);
  const [createdWebhook, setCreatedWebhook] = useState<any | null>(null);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [id: string]: any }>({});
  const [selectedWebhookHistory, setSelectedWebhookHistory] = useState<{ webhook: any; deliveries: any[] } | null>(null);

  // In-app Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Benefits & Billing State
  const [benefits, setBenefits] = useState<any>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [isUpgradingTier, setIsUpgradingTier] = useState<string | null>(null);

  // API Keys State
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [keyName, setKeyName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Audit State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const canManage = ["OWNER", "ADMIN"].includes(userRole);
  const isOwner = userRole === "OWNER";

  // Initial Loaders
  useEffect(() => {
    // Load Profile
    fetch("/api/user/profile")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.success) {
          setProfile(data.data.user);
          setFirstName(data.data.user.firstName || "");
          setLastName(data.data.user.lastName || "");
          if (data.data.role) {
            setUserRole(data.data.role);
          }
        }
      });

    // Load Sessions
    fetch("/api/user/sessions")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSessions(data.data.sessions || []);
      });

    // Load Organization Profile
    loadOrg();

    // Load Members
    loadMembers();

    // Load Invitations
    loadInvitations();

    // Load Webhooks
    loadWebhooks();

    // Load In-App Notifications
    loadNotifications();

    // Load Benefits & Billing
    loadBenefits();
    loadBilling();

    // Load API Keys
    loadApiKeys();

    // Load Audit
    fetch("/api/audit-logs")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.success) setAuditLogs(data.data.logs || []);
      })
      .catch(() => {});

    // Load Compliance & Data Retention
    loadRetention();
    loadDataExports();

    // Load System Canary & Backups
    loadCanaryDiagnostics();
    loadBackups();
  }, []);

  // Real-time SSE synchronization
  useEffect(() => {
    const es = new EventSource("/api/events/sse");
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "MEMBER_UPDATED") {
          loadMembers();
          loadInvitations();
        } else if (payload.type === "ORGANIZATION_UPDATED" || payload.type === "SUBSCRIPTION_UPDATED") {
          loadOrg();
          loadBenefits();
          loadBilling();
        } else if (payload.type === "NOTIFICATION") {
          loadNotifications();
        }
      } catch {}
    };
    return () => {
      es.close();
    };
  }, []);

  const loadOrg = () => {
    fetch("/api/org")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          setOrgData(data.data.organization);
          setOrgName(data.data.organization.name || "");
          setOrgSlug(data.data.organization.slug || "");
        }
      })
      .catch(() => {});
  };

  const loadMembers = () => {
    fetch("/api/org/members")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMembers(data.data.members || []);
      })
      .catch(() => {});
  };

  const loadInvitations = () => {
    fetch("/api/org/invitations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setInvitations(data.data.invitations || []);
      })
      .catch(() => {});
  };

  const loadWebhooks = () => {
    fetch("/api/webhooks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setWebhooks(data.data.webhooks || []);
      })
      .catch(() => {});
  };

  const loadNotifications = () => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          setNotifications(data.data.notifications || []);
          setUnreadNotificationCount(data.data.unreadCount || 0);
        }
      })
      .catch(() => {});
  };

  const loadApiKeys = () => {
    fetch("/api/org/api-keys")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.success) setApiKeys(data.data.apiKeys || []);
      })
      .catch(() => {});
  };

  const loadBenefits = () => {
    fetch("/api/org/benefits")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setBenefits(data.data.benefits);
      })
      .catch(() => {});
  };

  const loadBilling = () => {
    fetch("/api/billing")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setBillingData(data.data);
      })
      .catch(() => {});
  };

  const handleUpgradePlan = async (tier: string) => {
    setIsUpgradingTier(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planTier: tier }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        if (data.data.isSimulated) {
          alert(`Simulated Checkout: Successfully upgraded organization to ${tier} tier!`);
          loadBilling();
          loadBenefits();
          loadOrg();
        } else {
          window.location.href = data.data.url;
        }
      } else {
        alert(data.error?.message || "Failed to start checkout.");
      }
    } catch {
      alert("Error initiating checkout session.");
    } finally {
      setIsUpgradingTier(null);
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error?.message || "Failed to open billing portal.");
      }
    } catch {
      alert("Error opening billing portal.");
    }
  };

  const loadRetention = () => {
    fetch("/api/compliance/retention")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.data) {
          setRetentionPolicies({
            retentionAuditDays: data.data.retentionAuditDays ?? 365,
            retentionForecastDays: data.data.retentionForecastDays ?? 180,
            retentionJobDays: data.data.retentionJobDays ?? 30,
          });
        }
      })
      .catch(() => {});
  };

  const loadDataExports = () => {
    fetch("/api/compliance/export")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          setDataExports(data.data.exports || []);
        }
      })
      .catch(() => {});
  };

  const handleUpdateRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    setRetentionMessage(null);
    try {
      const res = await fetch("/api/compliance/retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditDays: Number(retentionPolicies.retentionAuditDays),
          forecastDays: Number(retentionPolicies.retentionForecastDays),
          jobDays: Number(retentionPolicies.retentionJobDays),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRetentionMessage({ type: "success", text: "Data retention policies successfully saved." });
      } else {
        setRetentionMessage({ type: "error", text: data.error || "Failed to update retention policies." });
      }
    } catch {
      setRetentionMessage({ type: "error", text: "Network error updating retention policies." });
    }
  };

  const handleRunRetentionCleanup = async () => {
    if (!confirm("Run immediate retention cleanup? Records older than your configured retention windows will be permanently pruned.")) return;
    setIsCleaningRetention(true);
    setRetentionCleanupResult(null);
    try {
      const res = await fetch("/api/compliance/retention/cleanup", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setRetentionCleanupResult(data.data.result);
      } else {
        alert(data.error || "Retention cleanup failed.");
      }
    } catch {
      alert("Network error running cleanup.");
    } finally {
      setIsCleaningRetention(false);
    }
  };

  const handleCreateDataExport = async () => {
    setIsExportingData(true);
    setExportMessage(null);
    try {
      const res = await fetch("/api/compliance/export", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setExportMessage({ type: "success", text: "Tenant data export archive successfully generated." });
        loadDataExports();
      } else {
        setExportMessage({ type: "error", text: data.error || "Failed to generate export." });
      }
    } catch {
      setExportMessage({ type: "error", text: "Network error initiating data export." });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleAnonymizeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (anonymizeConfirmText !== "DELETE MY ACCOUNT") {
      setAnonymizeMessage({ type: "error", text: "Confirmation text must exactly match 'DELETE MY ACCOUNT'." });
      return;
    }
    if (!anonymizePassword) {
      setAnonymizeMessage({ type: "error", text: "Password is required to confirm account deletion." });
      return;
    }
    setIsAnonymizing(true);
    setAnonymizeMessage(null);
    try {
      const res = await fetch("/api/user/anonymize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: anonymizePassword, confirmation: anonymizeConfirmText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Your account has been anonymized and all sessions revoked. Redirecting to login.");
        window.location.href = "/login";
      } else {
        setAnonymizeMessage({ type: "error", text: data.error || "Failed to anonymize account." });
      }
    } catch {
      setAnonymizeMessage({ type: "error", text: "Network error during account erasure." });
    } finally {
      setIsAnonymizing(false);
    }
  };

  const loadCanaryDiagnostics = () => {
    setIsLoadingCanary(true);
    fetch("/api/health/canary")
      .then((res) => res.json())
      .then((data) => {
        setCanaryReport(data);
      })
      .catch(() => {})
      .finally(() => setIsLoadingCanary(false));
  };

  const loadBackups = () => {
    fetch("/api/admin/backups")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setBackups(data.data.backups || []);
      })
      .catch(() => {});
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupMessage(null);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupMessage({ type: "success", text: "Atomic database snapshot backup created and verified successfully." });
        loadBackups();
      } else {
        setBackupMessage({ type: "error", text: data.error || "Failed to create database backup." });
      }
    } catch {
      setBackupMessage({ type: "error", text: "Network error creating database backup." });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingBackupId(backupId);
    setBackupMessage(null);
    try {
      const res = await fetch(`/api/admin/backups/${backupId}/verify`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupMessage({ type: "success", text: "Backup verified: SQLite magic headers & PRAGMA integrity check passed." });
        loadBackups();
      } else {
        setBackupMessage({ type: "error", text: data.error || "Backup verification failed." });
      }
    } catch {
      setBackupMessage({ type: "error", text: "Network error verifying backup." });
    } finally {
      setVerifyingBackupId(null);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          events: webhookEvents,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookName("");
        setWebhookUrl("");
        setWebhookEvents(["*"]);
        setCreatedWebhook(data.data.webhook);
        loadWebhooks();
      } else {
        alert(data.error?.message || "Failed to create webhook.");
      }
    } catch {
      alert("Error creating webhook.");
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this webhook endpoint?")) return;
    try {
      const res = await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        loadWebhooks();
      } else {
        alert(data.error?.message || "Failed to delete webhook.");
      }
    } catch {
      alert("Error deleting webhook.");
    }
  };

  const handleTestWebhook = async (id: string) => {
    setTestingWebhookId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResult((prev) => ({ ...prev, [id]: data.data.delivery }));
      } else {
        alert(data.error?.message || "Test webhook delivery failed.");
      }
    } catch {
      alert("Error testing webhook.");
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleRotateWebhookSecret = async (id: string) => {
    if (!confirm("Rotate this webhook secret? Existing signature verifications will immediately require the new secret.")) return;
    try {
      const res = await fetch(`/api/webhooks/${id}/rotate-secret`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`New Secret generated: ${data.data.newSecret}`);
        loadWebhooks();
      } else {
        alert(data.error?.message || "Failed to rotate secret.");
      }
    } catch {
      alert("Error rotating secret.");
    }
  };

  const handleViewDeliveries = async (webhook: any) => {
    try {
      const res = await fetch(`/api/webhooks/${webhook.id}/deliveries`);
      const data = await res.json();
      if (data.success) {
        setSelectedWebhookHistory({ webhook, deliveries: data.data.deliveries || [] });
      }
    } catch {
      alert("Error fetching delivery history.");
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "PATCH" });
      const data = await res.json();
      if (data.success) {
        loadNotifications();
      }
    } catch {}
  };

  const handleMarkSingleNotificationRead = async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      const data = await res.json();
      if (data.success) {
        loadNotifications();
      }
    } catch {}
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        loadNotifications();
      }
    } catch {}
  };

  // Handlers
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      const data = await res.json();
      if (data.success) {
        setProfileMessage({ type: "success", text: "Profile updated successfully!" });
      } else {
        setProfileMessage({ type: "error", text: data.error?.message || "Update failed." });
      }
    } catch {
      setProfileMessage({ type: "error", text: "Network error updating profile." });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords do not match." });
      return;
    }

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMessage({ type: "success", text: "Password changed successfully! Other sessions revoked." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage({ type: "error", text: data.error?.message || "Password change failed." });
      }
    } catch {
      setPasswordMessage({ type: "error", text: "Network error during password update." });
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgMessage(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName, slug: orgSlug }),
      });
      const data = await res.json();
      if (data.success) {
        setOrgMessage({ type: "success", text: "Organization profile updated successfully!" });
        loadOrg();
      } else {
        setOrgMessage({ type: "error", text: data.error?.message || "Failed to update organization." });
      }
    } catch {
      setOrgMessage({ type: "error", text: "Network error updating organization." });
    }
  };

  const handleDeleteOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDeleteSlug !== orgData?.slug) {
      alert("Please type the exact organization slug to confirm deletion.");
      return;
    }
    if (!confirm(`CAUTION: Deleting '${orgData?.name}' is irreversible. All datasets, forecasts, alerts, and team associations will be destroyed. Proceed?`)) {
      return;
    }
    setIsDeletingOrg(true);
    try {
      const res = await fetch("/api/org", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationSlug: confirmDeleteSlug }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Organization deleted successfully. Redirecting to login...");
        window.location.href = "/login";
      } else {
        alert(data.error?.message || "Failed to delete organization.");
        setIsDeletingOrg(false);
      }
    } catch {
      alert("Error deleting organization.");
      setIsDeletingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberMessage(null);
    setCreatedInviteLink(null);
    setCopiedLink(false);
    try {
      const res = await fetch("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          expiresInDays: 7,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteEmail("");
        loadInvitations();
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const fullLink = `${origin}${data.data.invitationLink}`;
        setCreatedInviteLink(fullLink);
        setMemberMessage({ type: "success", text: "Cryptographic invitation generated! Valid for 7 days." });
      } else {
        setMemberMessage({ type: "error", text: data.error?.message || "Failed to create invitation." });
      }
    } catch {
      setMemberMessage({ type: "error", text: "Network error creating invitation." });
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (!confirm("Revoke this invitation? The recipient will not be able to join.")) return;
    try {
      const res = await fetch(`/api/org/invitations?id=${invitationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadInvitations();
      } else {
        alert(data.error?.message || "Failed to revoke invitation.");
      }
    } catch {
      alert("Error revoking invitation.");
    }
  };

  const handleUpdateRole = async (membershipId: string, role: string) => {
    try {
      const res = await fetch(`/api/org/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success) {
        loadMembers();
      } else {
        alert(data.error?.message || "Failed to update role");
      }
    } catch {
      alert("Error updating role");
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(`/api/org/members/${membershipId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadMembers();
      } else {
        alert(data.error?.message || "Failed to remove member");
      }
    } catch {
      alert("Error removing member");
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/org/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName || "Production API Key" }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyName("");
        setCreatedSecret(data.data.rawSecret);
        loadApiKeys();
      }
    } catch {
      alert("Error generating API key");
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!confirm("Revoke this API key? Systems using it will immediately lose access.")) return;
    try {
      const res = await fetch(`/api/org/api-keys?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        loadApiKeys();
      }
    } catch {
      alert("Error revoking API key");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white">Settings & Administration</h1>
        <p className="text-xs text-slate-400 mt-1">
          Profile management, member access controls, enterprise quotas, developer API keys, and compliance audit.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: "profile", label: "Profile & Password", icon: User },
          { id: "org", label: "Organization & Governance", icon: Building },
          { id: "members", label: "Team & Member Access", icon: Users },
          { id: "benefits", label: "Admin Benefits & Quotas", icon: Shield },
          { id: "apikeys", label: "API Keys & Developers", icon: Key },
          { id: "webhooks", label: "Webhooks & Alerts", icon: Webhook, badge: unreadNotificationCount > 0 ? unreadNotificationCount : null },
          { id: "compliance", label: "GDPR & Data Retention", icon: ShieldAlert },
          { id: "system", label: "System Health & Backups", icon: Activity },
          { id: "audit", label: "Compliance Audit Trail", icon: History },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
              {t.badge && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILE & PASSWORD */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Details Form */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="h-5 w-5 text-blue-400" />
              <h2 className="text-sm font-bold text-white">Edit Personal Profile</h2>
            </div>

            {profileMessage && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  profileMessage.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}
              >
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Email Address</label>
                <input
                  type="text"
                  disabled
                  value={profile?.email || ""}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-400 cursor-not-allowed"
                />
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Verified Enterprise Email
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition"
              >
                Save Profile Changes
              </button>
            </form>
          </div>

          {/* Password Change Form */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Lock className="h-5 w-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Change Password & Security</h2>
            </div>

            {passwordMessage && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  passwordMessage.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Must be 8+ characters with uppercase, lowercase, number, and special character.
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 transition"
              >
                Update Password
              </button>
            </form>
          </div>

          {/* Active Sessions List */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Active Cryptographic Sessions</h3>
                <p className="text-xs text-slate-400">Tokens are hashed with SHA-256 and transmitted via HttpOnly cookies.</p>
              </div>
            </div>

            <div className="divide-y divide-slate-800/60 text-xs">
              {sessions.map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>{s.userAgent}</span>
                      {s.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          Current Device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      IP Address: {s.ipAddress} • Logged in: {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <span className="text-slate-400 text-[11px]">Active</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone: GDPR Right to Be Forgotten */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-red-950/20 border border-red-900/40 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <ShieldAlert className="h-5 w-5" />
              <h3 className="text-sm font-bold text-white">Danger Zone: GDPR Right to Be Forgotten (Art. 17)</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Permanent account erasure will purge all cryptographic sessions, zero out authentication credentials,
              scrub your email and profile into an irreversible hash, and revoke all organization memberships.
              Under platform security policies, you cannot erase your account if you are the sole Owner of an active organization.
            </p>

            {anonymizeMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  anonymizeMessage.type === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {anonymizeMessage.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{anonymizeMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleAnonymizeAccount} className="space-y-3 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Confirm Your Password
                  </label>
                  <input
                    type="password"
                    value={anonymizePassword}
                    onChange={(e) => setAnonymizePassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Type <code className="text-red-400 font-mono">DELETE MY ACCOUNT</code> to confirm
                  </label>
                  <input
                    type="text"
                    value={anonymizeConfirmText}
                    onChange={(e) => setAnonymizeConfirmText(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isAnonymizing || anonymizeConfirmText !== "DELETE MY ACCOUNT" || !anonymizePassword}
                  className="px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-red-600/90 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-red-600/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isAnonymizing ? "Anonymizing..." : "Permanently Erase & Anonymize Account"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: ORGANIZATION & GOVERNANCE */}
      {activeTab === "org" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Organization Profile Settings */}
            <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-blue-400" />
                  <h2 className="text-sm font-bold text-white">Organization Profile & Brand Identity</h2>
                </div>
                {orgData?.planTier && (
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                    {orgData.planTier} TIER
                  </span>
                )}
              </div>

              {orgMessage && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    orgMessage.type === "success"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}
                >
                  {orgMessage.text}
                </div>
              )}

              <form onSubmit={handleUpdateOrg} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Organization Display Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!canManage}
                    placeholder="Acme Analytics Global"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Appears on executive reports and shared digests.</p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Unique URL Slug / Tenant Identifier</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 rounded-l-lg bg-slate-900 border border-r-0 border-slate-800 text-slate-500 text-xs font-mono">
                      app.uwork.ai/
                    </span>
                    <input
                      type="text"
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value)}
                      disabled={!canManage}
                      placeholder="acme-corp"
                      required
                      className="flex-1 px-3 py-2 rounded-r-lg bg-slate-950 border border-slate-700/60 text-slate-200 font-mono outline-none focus:border-blue-500 transition disabled:opacity-60"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Lowercase alphanumeric characters and hyphens only. Used for routing and SSO isolation.
                  </p>
                </div>

                {canManage && (
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition text-xs"
                  >
                    Save Organization Changes
                  </button>
                )}
              </form>
            </div>

            {/* Organization Metadata Card */}
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">Tenant Governance Info</h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Tenant Identifier (UUID)</div>
                  <div className="font-mono text-slate-300 text-[11px] truncate mt-0.5">{orgData?.id || "Loading..."}</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Organization Owner(s)</div>
                  <div className="space-y-1 mt-1">
                    {orgData?.owners?.map((owner: any) => (
                      <div key={owner.userId} className="text-slate-300 font-medium">
                        {owner.name} <span className="text-[10px] text-slate-500">({owner.email})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Provisioned Timestamp</div>
                  <div className="text-slate-300 mt-0.5">
                    {orgData?.createdAt ? new Date(orgData.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone: Organization Deletion Safeguard */}
          {isOwner && (
            <div className="p-6 rounded-xl bg-red-950/20 border border-red-500/30 space-y-4">
              <div className="flex items-center gap-2 text-red-400">
                <ShieldAlert className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">Danger Zone: Organization Deletion Safeguard</h3>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Deleting an organization is permanently destructive. All datasets, historical forecasts, custom anomaly alerts,
                scheduled digests, and member memberships will be immediately purged. To confirm, type your organization slug{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-red-300 border border-red-500/40">
                  {orgData?.slug}
                </code>{" "}
                below.
              </p>

              <form onSubmit={handleDeleteOrg} className="flex flex-wrap items-center gap-3 text-xs max-w-md">
                <input
                  type="text"
                  value={confirmDeleteSlug}
                  onChange={(e) => setConfirmDeleteSlug(e.target.value)}
                  placeholder={`Type "${orgData?.slug}" to confirm`}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-red-500/40 text-red-200 font-mono outline-none focus:border-red-500 transition"
                />
                <button
                  type="submit"
                  disabled={confirmDeleteSlug !== orgData?.slug || isDeletingOrg}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold transition"
                >
                  {isDeletingOrg ? "Purging..." : "Permanently Delete"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEMBER MANAGEMENT & INVITATIONS */}
      {activeTab === "members" && (
        <div className="space-y-6">
          {/* Invite Member Box (Admins & Owners only) */}
          {canManage ? (
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Generate Cryptographic Team Invitation</h3>
                </div>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-blue-400" /> 7-Day Expiring SHA-256 Token
                </span>
              </div>

              {memberMessage && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    memberMessage.type === "success"
                      ? "bg-blue-500/10 border border-blue-500/20 text-blue-300"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}
                >
                  {memberMessage.text}
                </div>
              )}

              {createdInviteLink && (
                <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Shareable Secure Invitation Link:
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteLink);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }}
                      className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-white px-2 py-1 rounded bg-slate-900 border border-slate-800 transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
                    </button>
                  </div>
                  <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300 select-all break-all border border-slate-800">
                    {createdInviteLink}
                  </div>
                </div>
              )}

              <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-semibold">Recipient Enterprise Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="analyst@company.com"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Assigned Role</label>
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none focus:border-blue-500 transition"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0 transition shadow-lg shadow-blue-600/20"
                    >
                      Send Invite
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-blue-400 shrink-0" />
                <span>
                  Viewing team roster as <strong className="text-white">{userRole}</strong> (Read-Only Mode). Member invitations and role assignments are reserved for Organization Administrators.
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                {members.length} Members
              </span>
            </div>
          )}

          {/* Pending Invitations Table (Admins only) */}
          {canManage && invitations.length > 0 && (
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span>Pending Invitations ({invitations.filter((i) => i.status === "PENDING").length})</span>
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2 px-3">Invited Email</th>
                      <th className="py-2 px-3">Assigned Role</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Expires</th>
                      <th className="py-2 px-3">Invited By</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 font-mono text-white text-[11px]">{inv.email}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px]">
                            {inv.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.status === "PENDING"
                                ? "bg-amber-500/20 text-amber-400"
                                : inv.status === "ACCEPTED"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{inv.invitedBy}</td>
                        <td className="py-2.5 px-3 text-right">
                          {inv.status === "PENDING" && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded hover:bg-red-500/10 transition"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active Members Table */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Active Organization Members ({members.length})</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Joined Date</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {members.map((m) => {
                    const isTargetOwner = m.role === "OWNER";
                    const canModifyThisMember = canManage && (!isTargetOwner || isOwner);

                    return (
                      <tr key={m.membershipId} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{m.name}</span>
                            {m.isCurrentUser && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 text-[9px]">You</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{m.email}</div>
                        </td>

                        <td className="py-3 px-3">
                          {isTargetOwner && !isOwner ? (
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px]">
                              OWNER
                            </span>
                          ) : canModifyThisMember ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m.membershipId, e.target.value)}
                              className="bg-slate-950 border border-slate-700/60 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-blue-500 transition"
                            >
                              {isOwner && <option value="OWNER">OWNER</option>}
                              <option value="ADMIN">ADMIN</option>
                              <option value="ANALYST">ANALYST</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px]">
                              {m.role}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-slate-400">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {canModifyThisMember && !m.isCurrentUser && (!isTargetOwner || isOwner) ? (
                            <button
                              onClick={() => handleRemoveMember(m.membershipId)}
                              className="text-red-400 hover:text-red-300 transition p-1 rounded hover:bg-red-500/10"
                              title="Remove Member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-slate-500 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN BENEFITS, BILLING & QUOTAS */}
      {activeTab === "benefits" && benefits && (
        <div className="space-y-6">
          {/* Past Due Alert Banner */}
          {billingData?.subscription?.status === "PAST_DUE" && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-red-400">Subscription Payment Past Due</h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Your recent invoice could not be billed. Please update your payment method to avoid operational interruption.
                  </p>
                </div>
              </div>
              {canManage && (
                <button
                  onClick={handleOpenBillingPortal}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  Update Payment Method
                </button>
              )}
            </div>
          )}

          {/* Active Subscription Summary Card */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Active Subscription</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  {billingData?.subscription?.status || benefits.status}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white">{benefits.planName}</h2>
              <p className="text-xs text-slate-300">
                Tier: <strong className="text-blue-400">{benefits.planTier}</strong> • {benefits.billingCycle}
                {billingData?.subscription?.currentPeriodEnd && (
                  <span> • Renews on {new Date(billingData.subscription.currentPeriodEnd).toLocaleDateString()}</span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-right">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Guaranteed SLA</div>
                <div className="text-lg font-extrabold text-emerald-400">{benefits.quotas.sla}</div>
              </div>
              {canManage && (
                <button
                  onClick={handleOpenBillingPortal}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Billing Portal</span>
                </button>
              )}
            </div>
          </div>

          {/* Subscription Plans & Upgrades Grid */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">Subscription Plans & Quota Tiers</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  tier: "STARTER",
                  name: "Starter Tier",
                  price: "$0",
                  cadence: "Free Forever",
                  rows: "50K Rows",
                  storage: "500 MB Storage",
                  seats: "3 Team Seats",
                  forecasts: "25 Forecasts/mo",
                  features: ["Basic Chart Visuals", "CSV Uploads", "Weekly Email Digests"],
                },
                {
                  tier: "PRO",
                  name: "Professional Suite",
                  price: "$299",
                  cadence: "per month",
                  rows: "1 Million Rows",
                  storage: "10 GB Storage",
                  seats: "15 Team Seats",
                  forecasts: "500 Forecasts/mo",
                  popular: true,
                  features: ["Advanced ARIMA & Holt-Winters", "Outbound Webhooks", "Excel Ingestion", "Custom Alert Rules"],
                },
                {
                  tier: "ENTERPRISE",
                  name: "Enterprise BI & AI",
                  price: "$999",
                  cadence: "per month",
                  rows: "10 Million Rows",
                  storage: "100 GB Storage",
                  seats: "50 Team Seats",
                  forecasts: "10,000 Forecasts/mo",
                  features: ["8 Dedicated Workers", "99.99% SLA Guarantee", "7-Year Audit Forensics", "Priority Support"],
                },
              ].map((p) => {
                const isCurrent = (benefits.planTier || "ENTERPRISE").toUpperCase() === p.tier;
                return (
                  <div
                    key={p.tier}
                    className={`p-5 rounded-xl border flex flex-col justify-between transition ${
                      isCurrent
                        ? "bg-blue-950/20 border-blue-500/50 shadow-md shadow-blue-500/10"
                        : "bg-slate-900/80 border-slate-800"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">{p.name}</span>
                        {p.popular && !isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-semibold">
                            Popular
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            Current Plan
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="text-2xl font-extrabold text-white">{p.price}</div>
                        <div className="text-[11px] text-slate-400">{p.cadence}</div>
                      </div>

                      <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs text-slate-300">
                        <div className="font-semibold text-blue-400 text-[11px]">Included Quotas:</div>
                        <div>• {p.rows}</div>
                        <div>• {p.storage}</div>
                        <div>• {p.seats}</div>
                        <div>• {p.forecasts}</div>
                      </div>

                      <div className="border-t border-slate-800 pt-3 space-y-1 text-[11px] text-slate-400">
                        {p.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-5">
                      {isCurrent ? (
                        <button
                          disabled
                          className="w-full py-2 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed"
                        >
                          Active Tier
                        </button>
                      ) : canManage ? (
                        <button
                          onClick={() => handleUpgradePlan(p.tier)}
                          disabled={isUpgradingTier === p.tier}
                          className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                        >
                          {isUpgradingTier === p.tier ? "Processing..." : `Switch to ${p.name}`}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full py-2 rounded-lg bg-slate-800/60 text-slate-500 text-xs font-medium cursor-not-allowed"
                        >
                          Contact Administrator
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real-time Metered Quota Usage */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">Metered Resource Consumption</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Row Ingestion Capacity</span>
                  <Database className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-xl font-bold text-white">
                  {benefits.quotas.rows.used.toLocaleString()} / {benefits.quotas.rows.limit.toLocaleString()}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, benefits.quotas.rows.pct)}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-slate-400">{benefits.quotas.rows.pct}% Allocated</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Object Storage Space</span>
                  <HardDrive className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-xl font-bold text-white">
                  {benefits.quotas.storage.formattedUsed} / {benefits.quotas.storage.formattedLimit}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, benefits.quotas.storage.pct)}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-slate-400">{benefits.quotas.storage.pct}% Capacity</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Team Seat Allocation</span>
                  <Users className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-white">
                  {benefits.quotas.teamSeats.used} / {benefits.quotas.teamSeats.limit} Seats
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, benefits.quotas.teamSeats.pct)}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-slate-400">{benefits.quotas.teamSeats.pct}% Allocated</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Forecast Quota (Month)</span>
                  <Activity className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-white">
                  {benefits.quotas.forecasts.used} / {benefits.quotas.forecasts.limit}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: "10%" }}></div>
                </div>
                <div className="text-[10px] text-slate-400">Automated ARIMAX & Backtesting</div>
              </div>
            </div>
          </div>

          {/* Invoices History Table */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Billing & Invoices History</h3>
              <span className="text-[11px] text-slate-400 font-mono">Tax Invoices & Receipts</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Invoice ID</th>
                    <th className="py-2 px-3">Amount</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {billingData?.invoices?.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-white">
                        {inv.stripeInvoiceId || inv.id.slice(0, 12)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        ${(inv.amountPaidCents / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            inv.status === "PAID"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {inv.hostedInvoiceUrl || inv.invoicePdfUrl ? (
                          <a
                            href={inv.hostedInvoiceUrl || inv.invoicePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-semibold text-[11px]"
                          >
                            <span>View</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Receipt Generated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!billingData?.invoices || billingData.invoices.length === 0) && (
                <div className="py-6 text-center text-slate-500 text-xs">
                  No billing invoices issued yet. Invoices appear here automatically following monthly subscription renewals.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: API KEYS */}
      {activeTab === "apikeys" && (
        <div className="space-y-6">
          {!canManage ? (
            <div className="p-8 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Administrator Access Required</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Generating, viewing, and revoking programmatic API keys requires Organization Owner or Administrator privileges.
                Your current session role is <strong className="text-amber-400 font-semibold">{userRole}</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Create API Key */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Generate Developer API Key</h3>
                </div>

                {createdSecret && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <AlertCircle className="h-4 w-4" />
                      <span>Copy your API secret now! It will never be displayed again.</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950 font-mono text-xs text-white select-all break-all border border-slate-800">
                      {createdSecret}
                    </div>
                  </div>
                )}

                <form onSubmit={handleCreateApiKey} className="flex gap-3 text-xs max-w-lg">
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Key Name (e.g. CI/CD Ingestion Pipeline)"
                    required
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0 transition"
                  >
                    Create Key
                  </button>
                </form>
              </div>

              {/* Existing Keys Table */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Active API Keys ({apiKeys.length})</h3>

                <div className="divide-y divide-slate-800/60 text-xs">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">{k.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{k.keyPrefix}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Created: {new Date(k.createdAt).toLocaleDateString()} • Scopes: {k.scopes.join(", ")}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevokeApiKey(k.id)}
                        className="text-red-400 hover:text-red-300 text-xs font-semibold px-2 py-1 rounded hover:bg-red-500/10 transition"
                      >
                        Revoke Key
                      </button>
                    </div>
                  ))}

                  {apiKeys.length === 0 && (
                    <div className="py-6 text-center text-slate-400 text-xs">
                      No active API keys found. Generate one above for automated programmatic access.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: WEBHOOKS & NOTIFICATIONS */}
      {activeTab === "webhooks" && (
        <div className="space-y-6">
          {/* Section 1: In-App Notifications Center */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-400" />
                <h2 className="text-sm font-bold text-white">In-App Notification Center</h2>
                {unreadNotificationCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                    {unreadNotificationCount} unread
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={handleMarkAllNotificationsRead}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 transition ${
                    n.isRead
                      ? "bg-slate-900/40 border-slate-800/60 text-slate-400"
                      : "bg-blue-950/20 border-blue-800/40 text-slate-200 shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      {n.type === "CRITICAL" ? (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      ) : n.type === "WARNING" ? (
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                      ) : n.type === "SUCCESS" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Radio className="h-4 w-4 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{n.title}</span>
                        {!n.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{n.message}</p>
                      <span className="text-[10px] text-slate-500 mt-1 inline-block">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkSingleNotificationRead(n.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-500/10"
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteNotification(n.id)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded transition"
                      title="Delete notification"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {notifications.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No notifications found. Real-time platform alerts and system events will appear here.
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Outbound Webhook Integration Hub */}
          <div className="space-y-5">
            {!canManage ? (
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-3">
                <Webhook className="h-8 w-8 text-blue-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Webhook Management Restricted</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Configuring enterprise outbound webhooks and cryptographic HMAC signing keys is restricted to Organization Administrators and Owners.
                </p>
              </div>
            ) : (
              <>
                {/* Secret Alert Banner if newly created */}
                {createdWebhook && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-amber-400">Webhook Created Successfully</h4>
                      </div>
                      <button
                        onClick={() => setCreatedWebhook(null)}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-xs text-slate-300">
                      Copy your signing secret now. For security reasons, it will <strong>never be shown again</strong>.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-amber-300 font-mono text-xs flex-1 select-all break-all">
                        {createdWebhook.rawSecret}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdWebhook.rawSecret);
                          alert("Secret copied to clipboard!");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* Create Webhook Form */}
                <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Webhook className="h-5 w-5 text-blue-400" />
                    <h3 className="text-sm font-bold text-white">Register Outbound Webhook Endpoint</h3>
                  </div>
                  <form onSubmit={handleCreateWebhook} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">Endpoint Name</label>
                        <input
                          type="text"
                          required
                          value={webhookName}
                          onChange={(e) => setWebhookName(e.target.value)}
                          placeholder="e.g. Slack Enterprise Alerts"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">Target HTTPS Endpoint URL</label>
                        <input
                          type="url"
                          required
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          placeholder="https://api.yourdomain.com/webhooks/uwork"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300">Subscribed Events</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "*", label: "All Events (*)" },
                          { id: "FORECAST_GENERATED", label: "Forecast Generated" },
                          { id: "ANOMALY_DETECTED", label: "Anomaly Detected" },
                          { id: "DATASET_INGESTED", label: "Dataset Ingested" },
                          { id: "DECISION_CREATED", label: "Decision Created" },
                          { id: "SYSTEM_ALERT", label: "System Alert" },
                          { id: "NOTIFICATION", label: "In-App Notification" },
                        ].map((ev) => {
                          const isSelected = webhookEvents.includes(ev.id);
                          return (
                            <button
                              type="button"
                              key={ev.id}
                              onClick={() => {
                                if (ev.id === "*") {
                                  setWebhookEvents(["*"]);
                                } else {
                                  const filtered = webhookEvents.filter((e) => e !== "*");
                                  if (filtered.includes(ev.id)) {
                                    const next = filtered.filter((e) => e !== ev.id);
                                    setWebhookEvents(next.length === 0 ? ["*"] : next);
                                  } else {
                                    setWebhookEvents([...filtered, ev.id]);
                                  }
                                }
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium transition border ${
                                isSelected
                                  ? "bg-blue-600/30 border-blue-500 text-blue-300"
                                  : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
                              }`}
                            >
                              {ev.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/20"
                    >
                      Register Webhook Endpoint
                    </button>
                  </form>
                </div>

                {/* Configured Webhooks List */}
                <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white">Active Webhook Endpoints ({webhooks.length})</h3>
                    <span className="text-[11px] text-slate-500 font-mono">HMAC-SHA256 Signed</span>
                  </div>

                  <div className="divide-y divide-slate-800/60 text-xs">
                    {webhooks.map((w) => (
                      <div key={w.id} className="py-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{w.name}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  w.isActive
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {w.isActive ? "Active" : "Disabled"}
                              </span>
                              {w.failureCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-semibold">
                                  {w.failureCount} fails
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 mt-1 break-all">
                              {w.url}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {w.events.map((ev: string) => (
                                <span
                                  key={ev}
                                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-mono"
                                >
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handleTestWebhook(w.id)}
                              disabled={testingWebhookId === w.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium text-xs transition disabled:opacity-50"
                            >
                              <Send className="h-3 w-3" />
                              <span>{testingWebhookId === w.id ? "Sending..." : "Test Ping"}</span>
                            </button>
                            <button
                              onClick={() => handleViewDeliveries(w)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
                            >
                              <Activity className="h-3 w-3" />
                              <span>Logs</span>
                            </button>
                            <button
                              onClick={() => handleRotateWebhookSecret(w.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium text-xs transition"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Rotate Secret</span>
                            </button>
                            <button
                              onClick={() => handleDeleteWebhook(w.id)}
                              className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                              title="Delete Webhook"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Recent Test Result Preview */}
                        {testResult[w.id] && (
                          <div
                            className={`p-2.5 rounded-lg border text-[11px] font-mono flex items-center justify-between ${
                              testResult[w.id].status === "SUCCESS"
                                ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                                : "bg-red-950/20 border-red-800/40 text-red-300"
                            }`}
                          >
                            <span>
                              Result: {testResult[w.id].status} • HTTP {testResult[w.id].statusCode || "ERR"} • Latency: {testResult[w.id].durationMs}ms
                            </span>
                            <span className="text-[10px] text-slate-500 font-sans">
                              {new Date(testResult[w.id].deliveredAt || Date.now()).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}

                    {webhooks.length === 0 && (
                      <div className="py-6 text-center text-slate-500 text-xs">
                        No active webhooks configured. Register an endpoint above for real-time outbound automation.
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Logs Modal / History Panel */}
                {selectedWebhookHistory && (
                  <div className="p-6 rounded-xl bg-slate-900 border border-blue-500/30 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          Delivery Log: {selectedWebhookHistory.webhook.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {selectedWebhookHistory.webhook.url}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedWebhookHistory(null)}
                        className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700"
                      >
                        Close Logs
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                            <th className="py-2 px-3">Time</th>
                            <th className="py-2 px-3">Event</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">HTTP Code</th>
                            <th className="py-2 px-3">Duration</th>
                            <th className="py-2 px-3">Attempts</th>
                            <th className="py-2 px-3">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {selectedWebhookHistory.deliveries.map((del: any) => (
                            <tr key={del.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                {new Date(del.deliveredAt).toLocaleTimeString()}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-blue-400">
                                {del.event}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    del.status === "SUCCESS"
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : del.status === "DEAD_LETTER"
                                      ? "bg-purple-500/20 text-purple-400"
                                      : "bg-red-500/20 text-red-400"
                                  }`}
                                >
                                  {del.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px]">
                                {del.statusCode || "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {del.durationMs}ms
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {del.attemptCount}
                              </td>
                              <td className="py-2 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                                {del.error || "Delivered successfully"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {selectedWebhookHistory.deliveries.length === 0 && (
                        <div className="py-6 text-center text-slate-500 text-xs">
                          No delivery records found for this webhook endpoint.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB: COMPLIANCE & DATA RETENTION */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          {!canManage ? (
            <div className="p-8 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Compliance Controls Restricted</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Regulatory retention policies and tenant data takeout exports require Organization Administrator or Owner privileges.
                Your current role is <strong className="text-amber-400 font-semibold">{userRole}</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: Data Retention Lifecycle Policies */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Data Retention Policies</h3>
                      <p className="text-[11px] text-slate-400">Automated lifecycle pruning under GDPR Art. 5 & CCPA</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunRetentionCleanup}
                    disabled={isCleaningRetention}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isCleaningRetention ? "animate-spin text-blue-400" : ""}`} />
                    <span>{isCleaningRetention ? "Pruning..." : "Run Cleanup Now"}</span>
                  </button>
                </div>

                {retentionMessage && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      retentionMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {retentionMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{retentionMessage.text}</span>
                  </div>
                )}

                {retentionCleanupResult && (
                  <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>Retention Cleanup Completed</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Pruned: <strong className="text-white">{retentionCleanupResult.prunedAuditLogs}</strong> audit logs,{" "}
                      <strong className="text-white">{retentionCleanupResult.prunedForecasts}</strong> forecasts,{" "}
                      <strong className="text-white">{retentionCleanupResult.prunedJobs}</strong> background jobs.
                    </p>
                  </div>
                )}

                <form onSubmit={handleUpdateRetention} className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Audit Log Retention (Days)
                      </label>
                      <span className="text-xs font-mono text-blue-400">{retentionPolicies.retentionAuditDays} days</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="2555"
                      step="1"
                      value={retentionPolicies.retentionAuditDays}
                      onChange={(e) =>
                        setRetentionPolicies({
                          ...retentionPolicies,
                          retentionAuditDays: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-blue-500 bg-slate-800"
                    />
                    <span className="text-[10px] text-slate-500">Allowed range: 30 days to 2,555 days (7 years compliance max)</span>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Forecast Horizon Cache Retention (Days)
                      </label>
                      <span className="text-xs font-mono text-blue-400">{retentionPolicies.retentionForecastDays} days</span>
                    </div>
                    <input
                      type="range"
                      min="7"
                      max="730"
                      step="1"
                      value={retentionPolicies.retentionForecastDays}
                      onChange={(e) =>
                        setRetentionPolicies({
                          ...retentionPolicies,
                          retentionForecastDays: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-blue-500 bg-slate-800"
                    />
                    <span className="text-[10px] text-slate-500">Allowed range: 7 days to 730 days (2 years max)</span>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Job Execution History Retention (Days)
                      </label>
                      <span className="text-xs font-mono text-blue-400">{retentionPolicies.retentionJobDays} days</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="365"
                      step="1"
                      value={retentionPolicies.retentionJobDays}
                      onChange={(e) =>
                        setRetentionPolicies({
                          ...retentionPolicies,
                          retentionJobDays: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-blue-500 bg-slate-800"
                    />
                    <span className="text-[10px] text-slate-500">Allowed range: 1 day to 365 days</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-lg shadow-blue-600/20"
                  >
                    Save Retention Policies
                  </button>
                </form>
              </div>

              {/* Card 2: GDPR Data Portability & Takeout */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-purple-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">GDPR Tenant Data Takeout</h3>
                      <p className="text-[11px] text-slate-400">Article 20 compliant structured machine-readable export</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateDataExport}
                    disabled={isExportingData}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-purple-600/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isExportingData ? "Assembling..." : "Generate Export"}</span>
                  </button>
                </div>

                {exportMessage && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      exportMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {exportMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{exportMessage.text}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Past Export Archives (7-day retention)
                  </h4>
                  {dataExports.length === 0 ? (
                    <div className="p-6 text-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
                      No data exports generated yet. Click "Generate Export" to assemble an immutable JSON archive of all tenant datasets, forecasts, anomalies, decisions, and audit records.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 text-xs">
                      {dataExports.map((exp: any) => (
                        <div key={exp.id} className="py-3 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>Export #{exp.id.slice(0, 10)}</span>
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-bold">
                                {exp.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Size: {(exp.fileSizeBytes / 1024).toFixed(1)} KB • Created:{" "}
                              {new Date(exp.createdAt).toLocaleDateString()} • Expires:{" "}
                              {new Date(exp.expiresAt).toLocaleDateString()}
                            </div>
                          </div>
                          <a
                            href={`/api/compliance/export/${exp.id}?download=true`}
                            download
                            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center gap-1.5 border border-slate-700 text-xs font-semibold transition"
                          >
                            <Download className="h-3.5 w-3.5 text-purple-400" />
                            <span>Download JSON</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: SYSTEM HEALTH & AUTOMATED BACKUPS */}
      {activeTab === "system" && (
        <div className="space-y-6">
          {!canManage ? (
            <div className="p-8 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <Activity className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">System Diagnostics Restricted</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Canary probe telemetry and database snapshot management require Organization Administrator or Owner privileges.
                Your current role is <strong className="text-amber-400 font-semibold">{userRole}</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Real-Time Canary Health Probes */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        canaryReport?.overallStatus === "HEALTHY"
                          ? "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"
                          : canaryReport?.overallStatus === "DEGRADED"
                          ? "bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50"
                          : "bg-red-400 animate-pulse shadow-lg shadow-red-400/50"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">Synthetic Canary Diagnostics</h3>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            canaryReport?.overallStatus === "HEALTHY"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : canaryReport?.overallStatus === "DEGRADED"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {canaryReport?.overallStatus || "INITIALIZING"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Continuous synthetic roundtrip telemetry across database, storage, memory, and runtime event loops
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={loadCanaryDiagnostics}
                    disabled={isLoadingCanary}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingCanary ? "animate-spin text-blue-400" : ""}`} />
                    <span>{isLoadingCanary ? "Probing..." : "Run Canary Probes"}</span>
                  </button>
                </div>

                {/* Canary Probes Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Probe 1: Database */}
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <Database className="h-3.5 w-3.5 text-blue-400" />
                        <span>Database</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          canaryReport?.probes?.database?.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {canaryReport?.probes?.database?.status || "PASS"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {canaryReport?.probes?.database?.latencyMs ?? 0}ms
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {canaryReport?.probes?.database?.message || "Optimal query latency"}
                    </p>
                  </div>

                  {/* Probe 2: Storage */}
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <HardDrive className="h-3.5 w-3.5 text-purple-400" />
                        <span>Storage</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          canaryReport?.probes?.storage?.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {canaryReport?.probes?.storage?.status || "PASS"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {canaryReport?.probes?.storage?.latencyMs ?? 0}ms
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {canaryReport?.probes?.storage?.message || "Write/read verified"}
                    </p>
                  </div>

                  {/* Probe 3: Memory */}
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Memory RSS</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          canaryReport?.probes?.memory?.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {canaryReport?.probes?.memory?.status || "PASS"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {canaryReport?.probes?.memory?.details?.rssMb ?? 0} MB
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      Heap: {canaryReport?.probes?.memory?.details?.heapUsedMb ?? 0} MB (
                      {canaryReport?.probes?.memory?.details?.heapUtilizationPct ?? 0}%)
                    </p>
                  </div>

                  {/* Probe 4: Event Loop */}
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <Activity className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Event Loop</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          canaryReport?.probes?.eventLoop?.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {canaryReport?.probes?.eventLoop?.status || "PASS"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {canaryReport?.probes?.eventLoop?.latencyMs ?? 0}ms
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {canaryReport?.probes?.eventLoop?.message || "Sub-millisecond delay"}
                    </p>
                  </div>

                  {/* Probe 5: Job Queue */}
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <Layers className="h-3.5 w-3.5 text-amber-400" />
                        <span>Job Queue</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          canaryReport?.probes?.jobQueue?.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {canaryReport?.probes?.jobQueue?.status || "PASS"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {canaryReport?.probes?.jobQueue?.details?.runningJobs ?? 0} Active
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      Queued: {canaryReport?.probes?.jobQueue?.details?.queuedJobs ?? 0} • Stuck:{" "}
                      {canaryReport?.probes?.jobQueue?.details?.stuckJobs ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Automated Database Backups & Snapshots */}
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Automated Database Backups</h3>
                      <p className="text-[11px] text-slate-400">
                        Atomic SQLite snapshots with SHA-256 integrity verification and automated retention
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                  >
                    <HardDrive className={`h-3.5 w-3.5 ${isCreatingBackup ? "animate-pulse" : ""}`} />
                    <span>{isCreatingBackup ? "Creating Snapshot..." : "Create Snapshot Now"}</span>
                  </button>
                </div>

                {backupMessage && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      backupMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {backupMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{backupMessage.text}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Backup Snapshot Catalog (Max 10 Retained)
                  </h4>

                  {backups.length === 0 ? (
                    <div className="p-8 text-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
                      No database snapshots found. Click "Create Snapshot Now" to generate an atomic, SHA-256 validated SQLite backup.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                            <th className="py-2.5 px-3">Timestamp</th>
                            <th className="py-2.5 px-3">Filename</th>
                            <th className="py-2.5 px-3">Size</th>
                            <th className="py-2.5 px-3">Duration</th>
                            <th className="py-2.5 px-3">SHA-256 Checksum</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {backups.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-800/30 transition">
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                                {new Date(b.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-white font-mono text-[11px]">
                                {b.fileName}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                                {(b.fileSizeBytes / 1024).toFixed(1)} KB
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                                {b.durationMs}ms
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                                <span title={b.checksumSha256}>
                                  {b.checksumSha256.slice(0, 16)}...
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    b.status === "VERIFIED"
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : b.status === "COMPLETED"
                                      ? "bg-blue-500/20 text-blue-400"
                                      : "bg-red-500/20 text-red-400"
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyBackup(b.id)}
                                  disabled={verifyingBackupId === b.id}
                                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-semibold transition"
                                >
                                  {verifyingBackupId === b.id ? "Verifying..." : "Verify PRAGMA"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          {!canManage ? (
            <div className="py-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Audit Trail Restricted</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Immutable security audit logs and system forensic records are accessible exclusively to Organization Administrators and Owners.
                Your current role is <strong className="text-purple-400 font-semibold">{userRole}</strong>.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Immutable Security & Compliance Trail</h3>
                </div>
                <span className="text-xs text-slate-400">Append-only forensics log</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Resource</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {auditLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {new Date(l.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-white">
                          {l.user ? `${l.user.firstName} ${l.user.lastName}` : "System Service"}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-blue-400">{l.action}</td>
                        <td className="py-2.5 px-3 text-slate-400">{l.resourceType}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
