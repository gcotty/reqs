import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface LoadedProjectConfigJson {
  filePath: string | undefined;
  input: unknown;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function loadProjectConfigJson(
  requestFilePath: string,
): Promise<LoadedProjectConfigJson> {
  let directory = dirname(resolve(requestFilePath));

  while (true) {
    const filePath = join(directory, "reqs.json");

    try {
      const contents = await readFile(filePath, "utf8");

      return {
        filePath,
        input: JSON.parse(contents),
      };
    } catch (error: unknown) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    const parentDirectory = dirname(directory);

    if (parentDirectory === directory) {
      return {
        filePath: undefined,
        input: {
          version: 1,
        },
      };
    }

    directory = parentDirectory;
  }
}
