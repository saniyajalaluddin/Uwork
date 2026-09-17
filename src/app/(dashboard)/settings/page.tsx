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
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "org" | "members" | "benefits" | "apikeys" | "webhooks" | "audit">("profile");

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

  // Benefits State
  const [benefits, setBenefits] = useState<any>(null);

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

    // Load Benefits
    fetch("/api/org/benefits")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBenefits(data.data.benefits);
      });

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
        } else if (payload.type === "ORGANIZATION_UPDATED") {
          loadOrg();
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

      {/* TAB 3: ADMIN BENEFITS & QUOTAS */}
      {activeTab === "benefits" && benefits && (
        <div className="space-y-6">
          {/* Plan Tier Card */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Active Subscription</span>
              </div>
              <h2 className="text-xl font-bold text-white">{benefits.planName}</h2>
              <p className="text-xs text-slate-300">{benefits.billingCycle} • Status: <strong className="text-emerald-400">{benefits.status}</strong></p>
            </div>

            <div className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-right">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Guaranteed Availability</div>
              <div className="text-lg font-extrabold text-emerald-400">{benefits.quotas.sla}</div>
            </div>
          </div>

          {/* Quota Meters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Row Ingestion Capacity</span>
                <Database className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white">
                {benefits.quotas.rows.used.toLocaleString()} / 10M
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.max(2, benefits.quotas.rows.pct)}%` }}></div>
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
                <div className="bg-purple-500 h-full rounded-full" style={{ width: "2%" }}></div>
              </div>
              <div className="text-[10px] text-slate-400">Content-Addressed Storage Active</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Parallel Compute Nodes</span>
                <Cpu className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-white">
                {benefits.quotas.computeNodes.allocated} Dedicated Workers
              </div>
              <div className="text-[11px] text-emerald-400 mt-1 font-medium">
                High-Throughput ML Runners
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Team Seat Allocation</span>
                <Users className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-white">
                {benefits.quotas.teamSeats.used} / {benefits.quotas.teamSeats.limit} Seats
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Role-based access controls
              </div>
            </div>
          </div>

          {/* Included Features List */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Included Enterprise Benefits</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {benefits.featuresIncluded.map((feat: string, idx: number) => (
                <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
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
