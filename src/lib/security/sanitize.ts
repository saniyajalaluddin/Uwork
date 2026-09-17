import path from "path";
import crypto from "crypto";

/**
 * Sanitizes strings for spreadsheet exports (CSV/XLSX) to prevent
 * formula injection / DDE command execution attacks.
 * Dangerous characters: =, +, -, @, \t, \r
 */
export function sanitizeSpreadsheetCell(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  const dangerousStarts = ["=", "+", "-", "@", "\t", "\r"];

  if (dangerousStarts.some((char) => trimmed.startsWith(char))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Sanitizes entire row object for CSV export
 */
export function sanitizeSpreadsheetRow(row: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    sanitized[key] = sanitizeSpreadsheetCell(val);
  }
  return sanitized;
}

/**
 * Strips path traversal characters and normalizes file names
 */
export function sanitizeFileName(originalName: string): string {
  const basename = path.basename(originalName);
  // Remove control characters and non-printable characters
  const cleanName = basename.replace(/[^\w.\-]/gi, "_");
  const ext = path.extname(cleanName).toLowerCase();
  const nameWithoutExt = path.basename(cleanName, ext);
  return `${nameWithoutExt.substring(0, 100)}${ext}`;
}

/**
 * Generates an unpredictable, content-addressed storage key
 */
export function generateStorageKey(orgId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const randomSuffix = crypto.randomBytes(16).toString("hex");
  return `org_${orgId}/${Date.now()}_${randomSuffix}${ext}`;
}

/**
 * Basic XSS string escaping
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

