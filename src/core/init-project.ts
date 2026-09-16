import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface InitProjectResult {
  created: string[];
  addedIgnoreEntries: string[];
}

const ignoreRules = [
  { entry: "/reqs.json", accepted: ["/reqs.json", "reqs.json"] },
  { entry: "requests/", accepted: ["requests/", "/requests/"] },
  { entry: ".reqs/", accepted: [".reqs/", "/.reqs/"] },
];

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function existsAs(
  path: string,
  type: "file" | "directory",
): Promise<boolean> {
  try {
    const info = await stat(path);
    const matches = type === "file" ? info.isFile() : info.isDirectory();

    if (!matches) {
      throw new Error(`Expected ${path} to be a ${type}`);
    }

    return true;
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function initProject(
  directory: string = process.cwd(),
): Promise<InitProjectResult> {
  const configPath = join(directory, "reqs.json");
  const requestsPath = join(directory, "requests");
  const ignorePath = join(directory, ".gitignore");
  const [configExists, requestsExist, ignoreText] = await Promise.all([
    existsAs(configPath, "file"),
    existsAs(requestsPath, "directory"),
    readIfPresent(ignorePath),
  ]);
  const created: string[] = [];

  if (!configExists) {
    await writeFile(configPath, '{\n  "version": 1\n}\n', { flag: "wx" });
    created.push("reqs.json");
  }

  if (!requestsExist) {
    await mkdir(requestsPath);
    created.push("requests/");
  }

  const existingEntries = new Set(
    (ignoreText ?? "").split(/\r?\n/).map((line) => line.trim()),
  );
  const addedIgnoreEntries = ignoreRules
    .filter((rule) => !rule.accepted.some((entry) => existingEntries.has(entry)))
    .map((rule) => rule.entry);

  if (addedIgnoreEntries.length > 0) {
    const separator =
      ignoreText === undefined || ignoreText === "" || ignoreText.endsWith("\n")
        ? ""
        : "\n";
    const addition = `${separator}${addedIgnoreEntries.join("\n")}\n`;

    if (ignoreText === undefined) {
      await writeFile(ignorePath, addition, { flag: "wx" });
      created.push(".gitignore");
    } else {
      await appendFile(ignorePath, addition);
    }
  }

  return { created, addedIgnoreEntries };
}
