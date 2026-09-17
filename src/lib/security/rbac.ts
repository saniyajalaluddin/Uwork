export type Role = "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";

export type Permission =
  | "org:manage"
  | "org:delete"
  | "members:manage"
  | "datasets:read"
  | "datasets:write"
  | "datasets:delete"
  | "analytics:read"
  | "forecasts:read"
  | "forecasts:write"
  | "reports:read"
  | "reports:write"
  | "alerts:manage"
  | "api_keys:manage";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    "org:manage",
    "org:delete",
    "members:manage",
    "datasets:read",
    "datasets:write",
    "datasets:delete",
    "analytics:read",
    "forecasts:read",
    "forecasts:write",
    "reports:read",
    "reports:write",
    "alerts:manage",
    "api_keys:manage",
  ],
  ADMIN: [
    "org:manage",
    "members:manage",
    "datasets:read",
    "datasets:write",
    "datasets:delete",
    "analytics:read",
    "forecasts:read",
    "forecasts:write",
    "reports:read",
    "reports:write",
    "alerts:manage",
    "api_keys:manage",
  ],
  ANALYST: [
    "datasets:read",
    "datasets:write",
    "analytics:read",
    "forecasts:read",
    "forecasts:write",
    "reports:read",
    "reports:write",
    "alerts:manage",
  ],
  VIEWER: [
    "datasets:read",
    "analytics:read",
    "forecasts:read",
    "reports:read",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function assertRole(role: string, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(role as Role);
}

