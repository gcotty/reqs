import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectConfig } from "../core/project-config.js";
import { resolveAuth } from "../core/resolve-auth.js";

const config: ProjectConfig = {
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
    search: {
      type: "apiKey",
      location: "query",
      name: "api_key",
      value: {
        env: "SEARCH_API_KEY",
      },
    },
    service: {
      type: "bearer",
      token: {
        env: "SERVICE_TOKEN",
      },
    },
  },
};

test("resolves a bearer token into an Authorization header", async () => {
  const result = await resolveAuth("service", config, {
    env: {
      SERVICE_TOKEN: "secret-token",
    },
  });

  assert.deepStrictEqual(result, {
    location: "header",
    name: "Authorization",
    value: "Bearer secret-token",
  });
});

test("resolves an API key into a configured header", async () => {
  const result = await resolveAuth("nba", config, {
    env: {
      NBA_API_KEY: "nba-secret",
    },
  });

  assert.deepStrictEqual(result, {
    location: "header",
    name: "X-NBA-Api-Key",
    value: "nba-secret",
  });
});

test("resolves an API key into a configured query parameter", async () => {
  const result = await resolveAuth("search", config, {
    env: {
      SEARCH_API_KEY: "search-secret",
    },
  });

  assert.deepStrictEqual(result, {
    location: "query",
    name: "api_key",
    value: "search-secret",
  });
});

test("rejects a missing auth profile", async () => {
  await assert.rejects(
    resolveAuth("missing", config, { env: {} }),
    /Auth profile "missing" was not found/,
  );
});

test("rejects missing and empty environment secrets", async () => {
  for (const env of [{}, { NBA_API_KEY: "" }]) {
    await assert.rejects(
      resolveAuth("nba", config, { env }),
      /Environment variable NBA_API_KEY for auth profile "nba" must be set and non-empty/,
    );
  }
});
