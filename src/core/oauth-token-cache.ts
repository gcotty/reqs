import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ClientCredentialsTokenRequest } from "./request-client-credentials-token.js";

interface CacheEntry {
  fingerprint: string;
  accessToken: string;
  refreshAt: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cachePath(directory: string, profileName: string): string {
  return join(directory, `${hash(profileName)}.json`);
}

export function tokenFingerprint(request: ClientCredentialsTokenRequest): string {
  return hash(JSON.stringify([
    request.tokenUrl,
    request.scope,
    request.clientId,
    request.clientSecret,
  ]));
}

async function isPrivateDirectory(directory: string): Promise<boolean> {
  try {
    const info = await lstat(directory);
    return info.isDirectory() && (info.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

async function ensurePrivateDirectory(directory: string): Promise<boolean> {
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      return false;
    }
  }

  try {
    const info = await lstat(directory);

    if (!info.isDirectory()) {
      return false;
    }

    if ((info.mode & 0o077) !== 0) {
      await chmod(directory, 0o700);
    }

    return isPrivateDirectory(directory);
  } catch {
    return false;
  }
}

export async function readCachedToken(
  directory: string,
  profileName: string,
  fingerprint: string,
): Promise<string | undefined> {
  if (!(await isPrivateDirectory(directory))) {
    return undefined;
  }

  try {
    const path = cachePath(directory, profileName);
    const info = await lstat(path);

    if (!info.isFile() || (info.mode & 0o077) !== 0) {
      return undefined;
    }

    const entry: unknown = JSON.parse(await readFile(path, "utf8"));

    if (typeof entry !== "object" || entry === null) {
      return undefined;
    }

    const fields = entry as Partial<CacheEntry>;

    if (
      fields.fingerprint !== fingerprint ||
      typeof fields.accessToken !== "string" ||
      fields.accessToken === "" ||
      /[\u0000-\u001f\u007f]/u.test(fields.accessToken) ||
      typeof fields.refreshAt !== "number" ||
      !Number.isFinite(fields.refreshAt) ||
      fields.refreshAt <= Date.now()
    ) {
      return undefined;
    }

    return fields.accessToken;
  } catch {
    return undefined;
  }
}

export async function writeCachedToken(
  directory: string,
  profileName: string,
  fingerprint: string,
  accessToken: string,
  issuedAt: number,
  expiresIn: number | undefined,
): Promise<void> {
  if (expiresIn === undefined) {
    return;
  }

  const lifetimeMs = expiresIn * 1000;
  const refreshAt = issuedAt + lifetimeMs - Math.min(30_000, lifetimeMs * 0.1);

  if (!Number.isSafeInteger(Math.floor(refreshAt)) || refreshAt <= Date.now()) {
    return;
  }

  const path = cachePath(directory, profileName);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;

  if (!(await ensurePrivateDirectory(directory))) {
    return;
  }

  try {
    const entry: CacheEntry = { fingerprint, accessToken, refreshAt };
    await writeFile(temporaryPath, JSON.stringify(entry), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch {
    try {
      await unlink(temporaryPath);
    } catch {
      // Caching is best effort; the issued token remains usable for this run.
    }
  }
}
