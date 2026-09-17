import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { generateStorageKey, sanitizeFileName } from "../security/sanitize";

const BASE_STORAGE_DIR = path.resolve(process.cwd(), "storage");

export async function ensureStorageDirectories() {
  await fs.mkdir(path.join(BASE_STORAGE_DIR, "uploads"), { recursive: true });
  await fs.mkdir(path.join(BASE_STORAGE_DIR, "reports"), { recursive: true });
}

export async function saveUploadedFile(
  organizationId: string,
  originalFileName: string,
  content: Buffer
): Promise<{
  storagePath: string;
  sanitizedName: string;
  fileSizeBytes: number;
  checksumSha256: string;
}> {
  await ensureStorageDirectories();

  const sanitizedName = sanitizeFileName(originalFileName);
  const relativeKey = generateStorageKey(organizationId, sanitizedName);
  const fullPath = path.join(BASE_STORAGE_DIR, "uploads", relativeKey);

  // Prevent path traversal
  const resolved = path.resolve(fullPath);
  const uploadsBase = path.resolve(BASE_STORAGE_DIR, "uploads");
  if (!resolved.startsWith(uploadsBase)) {
    throw new Error("Invalid storage path destination.");
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content);

  const checksumSha256 = crypto.createHash("sha256").update(content).digest("hex");

  return {
    storagePath: path.relative(process.cwd(), resolved).replace(/\\/g, "/"),
    sanitizedName,
    fileSizeBytes: content.length,
    checksumSha256,
  };
}

export function resolveStorageFilePath(storagePath: string): string {
  const resolved = path.resolve(process.cwd(), storagePath);
  const storageBase = path.resolve(BASE_STORAGE_DIR);
  if (!resolved.startsWith(storageBase)) {
    throw new Error("Access to path outside storage directory is forbidden.");
  }
  return resolved;
}

export function getStorageFileStream(storagePath: string): import("fs").ReadStream {
  const resolved = resolveStorageFilePath(storagePath);
  return (require("fs") as typeof import("fs")).createReadStream(resolved);
}

export async function readStorageFile(storagePath: string): Promise<Buffer> {
  const resolved = resolveStorageFilePath(storagePath);
  return fs.readFile(resolved);
}

export async function deleteStorageFile(storagePath: string): Promise<void> {
  try {
    const resolved = path.resolve(process.cwd(), storagePath);
    const storageBase = path.resolve(BASE_STORAGE_DIR);
    if (!resolved.startsWith(storageBase)) {
      throw new Error("Invalid deletion path.");
    }
    await fs.unlink(resolved);
  } catch (err) {
    // Ignore if file doesn't exist
  }
}

