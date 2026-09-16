import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExplicitPath(input: string): boolean {
  return (
    isAbsolute(input) ||
    input.startsWith(".") ||
    input.startsWith("requests/") ||
    input.endsWith(".json")
  );
}

export async function resolveRequestFilePath(
  input: string,
  workingDirectory: string = process.cwd(),
): Promise<string> {
  const directPath = resolve(workingDirectory, input);

  if (isExplicitPath(input)) {
    return directPath;
  }

  try {
    if ((await stat(directPath)).isFile()) {
      return directPath;
    }
  } catch (error: unknown) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  const parts = input.split("/");

  if (
    parts.some(
      (part) =>
        part === "" || part === "." || part === ".." || part.includes("\\"),
    )
  ) {
    throw new Error(`Invalid request name: "${input}"`);
  }

  return join(workingDirectory, "requests", ...parts) + ".json";
}

export async function listRequestNames(
  workingDirectory: string = process.cwd(),
): Promise<string[]> {
  const requestsDirectory = join(workingDirectory, "requests");
  const names: string[] = [];

  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = prefix + entry.name;

      if (entry.isDirectory()) {
        await visit(path, `${name}/`);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        names.push(name.slice(0, -".json".length));
      }
    }
  }

  try {
    await visit(requestsDirectory, "");
  } catch (error: unknown) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  return names.sort();
}
