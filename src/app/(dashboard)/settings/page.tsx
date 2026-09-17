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
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "members" | "benefits" | "apikeys" | "audit">("profile");

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

  // Members State
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState("ANALYST");
  const [memberMessage, setMemberMessage] = useState<string | null>(null);

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

    // Load Members (now available to all authenticated org members)
    loadMembers();

    // Load Benefits (available to all org members)
    fetch("/api/org/benefits")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBenefits(data.data.benefits);
      });

    // Load API Keys (safely)
    loadApiKeys();

    // Load Audit (safely)
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

  const loadMembers = () => {
    fetch("/api/org/members")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMembers(data.data.members || []);
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

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberMessage(null);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          firstName: inviteFirstName,
          lastName: inviteLastName,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteEmail("");
        setInviteFirstName("");
        setInviteLastName("");
        loadMembers();
        setMemberMessage("Member invited successfully!");
      } else {
        setMemberMessage(data.error?.message || "Failed to invite member.");
      }
    } catch {
      setMemberMessage("Error inviting member.");
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
          { id: "members", label: "Team & Member Access", icon: Users },
          { id: "benefits", label: "Admin Benefits & Quotas", icon: Shield },
          { id: "apikeys", label: "API Keys & Developers", icon: Key },
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

      {/* TAB 2: MEMBER MANAGEMENT */}
      {activeTab === "members" && (
        <div className="space-y-6">
          {/* Invite Member Box (Admins only) */}
          {canManage ? (
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Invite Team Member</h3>
              </div>

              {memberMessage && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                  {memberMessage}
                </div>
              )}

              <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@apex.com"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">First Name</label>
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="Alex"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Last Name</label>
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Taylor"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Assigned Role</label>
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/60 text-slate-200 outline-none"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0 transition"
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

          {/* Members Table */}
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
                  {members.map((m) => (
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
                        {m.role === "OWNER" ? (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px]">
                            OWNER
                          </span>
                        ) : canManage ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleUpdateRole(m.membershipId, e.target.value)}
                            className="bg-slate-950 border border-slate-700/60 text-slate-200 text-xs rounded px-2 py-1 outline-none"
                          >
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
                        {canManage && m.role !== "OWNER" && !m.isCurrentUser ? (
                          <button
                            onClick={() => handleRemoveMember(m.membershipId)}
                            className="text-red-400 hover:text-red-300 transition p-1"
                            title="Remove Member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
