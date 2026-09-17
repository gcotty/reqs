import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    warehouse: {
      type: "apiKey",
      location: "header",
      name: "X-Warehouse-Key",
      value: {
        kv: "warehouse-api-key",
      },
    },
    oauth: {
      type: "oauth2ClientCredentials",
      tokenUrl: "https://auth.example.test/connect/token",
      scope: "api.read",
      clientId: {
        env: "EXAMPLE_CLIENT_ID",
      },
      clientSecret: {
        kv: "example-client-secret",
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

test("resolves OAuth client credentials into a Bearer header", async () => {
  let requestedSecretName: string | undefined;

  const result = await resolveAuth("oauth", config, {
    env: { EXAMPLE_CLIENT_ID: "example-id" },
    resolveKeyVaultSecret: async (secretName) => {
      requestedSecretName = secretName;
      return "example-secret\r\n";
    },
    fetcher: async (input, init) => {
      assert.equal(String(input), "https://auth.example.test/connect/token");
      assert.ok(init?.body instanceof URLSearchParams);
      assert.equal(init.body.get("grant_type"), "client_credentials");
      assert.equal(init.body.get("scope"), "api.read");
      assert.equal(init.body.get("client_id"), "example-id");
      assert.equal(init.body.get("client_secret"), "example-secret");

      return new Response(
        JSON.stringify({ access_token: "issued-token", token_type: "Bearer" }),
      );
    },
  });

  assert.equal(requestedSecretName, "example-client-secret");
  assert.deepStrictEqual(result, {
    location: "header",
    name: "Authorization",
    value: "Bearer issued-token",
    requiresHttps: true,
  });
});

test("does not request an OAuth token when credentials are missing", async () => {
  let fetchCalled = false;

  await assert.rejects(
    resolveAuth("oauth", config, {
      env: {},
      fetcher: async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called");
      },
    }),
    /Environment variable EXAMPLE_CLIENT_ID for auth profile "oauth" must be set and non-empty/u,
  );

  assert.equal(fetchCalled, false);
});

test("does not cache OAuth tokens without a usable lifetime", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "reqs-auth-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let tokenRequests = 0;
  const options = {
    env: { EXAMPLE_CLIENT_ID: "example-id" },
    resolveKeyVaultSecret: async () => "example-secret",
    fetcher: async () => {
      tokenRequests += 1;
      return new Response(JSON.stringify({
        access_token: `token-${tokenRequests}`,
        token_type: "Bearer",
      }));
    },
    tokenCacheDirectory: join(directory, ".reqs"),
  };

  const first = await resolveAuth("oauth", config, options);
  const second = await resolveAuth("oauth", config, options);

  assert.equal(first.value, "Bearer token-1");
  assert.equal(second.value, "Bearer token-2");
  assert.equal(tokenRequests, 2);
  await assert.rejects(readdir(options.tokenCacheDirectory), { code: "ENOENT" });
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

test("resolves a Key Vault secret and removes trailing line endings", async () => {
  let requestedSecretName: string | undefined;

  const result = await resolveAuth("warehouse", config, {
    env: {},
    resolveKeyVaultSecret: async (secretName) => {
      requestedSecretName = secretName;
      return "warehouse-secret\r\n";
    },
  });

  assert.equal(requestedSecretName, "warehouse-api-key");
  assert.deepStrictEqual(result, {
    location: "header",
    name: "X-Warehouse-Key",
    value: "warehouse-secret",
  });
});

test("rejects empty Key Vault secrets", async () => {
  for (const value of ["", "\n", "\r\n"]) {
    await assert.rejects(
      resolveAuth("warehouse", config, {
        env: {},
        resolveKeyVaultSecret: async () => value,
      }),
      /Key Vault secret "warehouse-api-key" for auth profile "warehouse" must be non-empty/,
    );
  }
});

test("reports Key Vault command failures without exposing provider output", async () => {
  await assert.rejects(
    resolveAuth("warehouse", config, {
      env: {},
      resolveKeyVaultSecret: async () => {
        throw new Error("sensitive provider output");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        'Failed to retrieve Key Vault secret "warehouse-api-key" for auth profile "warehouse"',
      );
      assert.doesNotMatch(error.message, /sensitive provider output/);
      return true;
    },
  );
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
