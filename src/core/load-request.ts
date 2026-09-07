import { readFile } from "node:fs/promises";

export async function loadReqestJson(filePath: string): Promise<unknown> {
  const contents = await readFile(filePath, "utf8");

  return JSON.parse(contents);
}
