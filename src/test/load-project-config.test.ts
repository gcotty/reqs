import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { loadProjectConfigJson } from "../core/load-project-config.js";

async function createTempDirectory(
  context: TestContext,
): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), "reqs-project-config-"),
  );

  context.after(() =>
    rm(directory, {
      recursive: true,
      force: true,
    }),
  );

  return directory;
}

test("loads a project config from a request file ancestor", async (context) => {
  const directory = await createTempDirectory(context);
  const requestDirectory = join(directory, "requests", "nba");
  const requestFilePath = join(requestDirectory, "boxscore.json");
  const configFilePath = join(directory, "reqs.json");
  const config = {
    version: 1,
    auth: {
      nba: {
        type: "apiKey",
        location: "header",
        name: "X-NBA-Api-Key",
        value: {
          env: "NBA_API_KEY",
        },
      },
    },
  };

  await mkdir(requestDirectory, { recursive: true });
  await writeFile(configFilePath, JSON.stringify(config), "utf8");

  const loaded = await loadProjectConfigJson(requestFilePath);

  assert.equal(loaded.filePath, configFilePath);
  assert.deepStrictEqual(loaded.input, config);
});

test("uses the nearest project config", async (context) => {
  const directory = await createTempDirectory(context);
  const requestDirectory = join(directory, "requests", "nba");
  const requestFilePath = join(requestDirectory, "boxscore.json");
  const rootConfigFilePath = join(directory, "reqs.json");
  const nearestConfigFilePath = join(
    directory,
    "requests",
    "reqs.json",
  );

  await mkdir(requestDirectory, { recursive: true });
  await writeFile(
    rootConfigFilePath,
    JSON.stringify({ version: 1, auth: {} }),
    "utf8",
  );
  await writeFile(
    nearestConfigFilePath,
    JSON.stringify({ version: 1 }),
    "utf8",
  );

  const loaded = await loadProjectConfigJson(requestFilePath);

  assert.equal(loaded.filePath, nearestConfigFilePath);
  assert.deepStrictEqual(loaded.input, { version: 1 });
});

test("returns a default config when no project config exists", async (context) => {
  const directory = await createTempDirectory(context);
  const requestFilePath = join(
    directory,
    "requests",
    "nba",
    "boxscore.json",
  );

  const loaded = await loadProjectConfigJson(requestFilePath);

  assert.equal(loaded.filePath, undefined);
  assert.deepStrictEqual(loaded.input, { version: 1 });
});

test("rejects malformed project config JSON", async (context) => {
  const directory = await createTempDirectory(context);
  const requestDirectory = join(directory, "requests");
  const requestFilePath = join(requestDirectory, "request.json");
  const configFilePath = join(directory, "reqs.json");

  await mkdir(requestDirectory, { recursive: true });
  await writeFile(configFilePath, "{ invalid JSON", "utf8");

  await assert.rejects(
    loadProjectConfigJson(requestFilePath),
    SyntaxError,
  );
});
