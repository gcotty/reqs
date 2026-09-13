import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { loadRequestJson } from "../core/load-request.js";

async function createTempDirectory(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "reqs-load-request-"));

  context.after(() =>
    rm(directory, {
      recursive: true,
      force: true,
    }),
  );

  return directory;
}

test("loads and parses a JSON file", async (context) => {
  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");

  const input = {
    version: 1,
    method: "GET",
    url: "https://example.com/users",
  };

  await writeFile(filePath, JSON.stringify(input), "utf8");

  const result = await loadRequestJson(filePath);

  assert.deepStrictEqual(result, input);
});

test("rejects malformed JSON", async (context) => {
  const directory = await createTempDirectory(context);
  const filePath = join(directory, "invalid.json");

  await writeFile(filePath, "{ invalid JSON", "utf8");

  await assert.rejects(loadRequestJson(filePath), SyntaxError);
});

test("rejects a missing file", async (context) => {
  const directory = await createTempDirectory(context);
  const filePath = join(directory, "missing.json");

  await assert.rejects(loadRequestJson(filePath), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok("code" in error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
});
