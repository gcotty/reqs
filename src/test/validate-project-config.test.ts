import assert from "node:assert/strict";
import { test } from "node:test";

import { validateProjectConfig } from "../core/validate-project-config.js";

test("accepts bearer and API-key auth profiles", () => {
  const input = {
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
    },
  };

  assert.deepStrictEqual(validateProjectConfig(input), input);
});

test("accepts a project config without auth profiles", () => {
  assert.deepStrictEqual(validateProjectConfig({ version: 1 }), {
    version: 1,
  });
});

test("accepts an OAuth client credentials profile", () => {
  const input = {
    version: 1,
    auth: {
      example: {
        type: "oauth2ClientCredentials",
        tokenUrl: "https://auth.example.test/connect/token",
        scope: "api.read",
        clientId: { env: "EXAMPLE_CLIENT_ID" },
        clientSecret: { kv: "example-client-secret" },
      },
    },
  };

  assert.deepStrictEqual(validateProjectConfig(input), input);
});

test("rejects invalid project config roots and versions", () => {
  for (const input of [null, [], "config", 42]) {
    assert.throws(
      () => validateProjectConfig(input),
      /Project config must be a JSON object/,
    );
  }

  assert.throws(
    () => validateProjectConfig({ version: 2 }),
    /Project config version must be 1/,
  );
});

test("rejects invalid bearer token references", () => {
  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          service: {
            type: "bearer",
            token: {
              env: "",
            },
          },
        },
      }),
    /Auth profile "service" token must reference a non-empty environment variable/,
  );
});

test("rejects invalid Key Vault secret references", () => {
  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          service: {
            type: "bearer",
            token: {
              kv: "",
            },
          },
        },
      }),
    /Auth profile "service" token must reference a non-empty Key Vault secret name/,
  );

  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          service: {
            type: "bearer",
            token: {
              env: "SERVICE_TOKEN",
              kv: "service-token",
            },
          },
        },
      }),
    /Auth profile "service" token must contain exactly one of "env" or "kv"/,
  );
});

test("rejects invalid API-key configuration", () => {
  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          nba: {
            type: "apiKey",
            location: "cookie",
            name: "X-NBA-Api-Key",
            value: {
              env: "NBA_API_KEY",
            },
          },
        },
      }),
    /Auth profile "nba" location must be "header" or "query"/,
  );

  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          nba: {
            type: "apiKey",
            location: "header",
            name: "",
            value: {
              env: "NBA_API_KEY",
            },
          },
        },
      }),
    /Auth profile "nba" name must be a non-empty string/,
  );
});

test("rejects invalid OAuth client credentials configuration", () => {
  const profile = {
    type: "oauth2ClientCredentials",
    tokenUrl: "https://auth.example.test/connect/token",
    scope: "api.read",
    clientId: { env: "EXAMPLE_CLIENT_ID" },
    clientSecret: { env: "EXAMPLE_CLIENT_SECRET" },
  };

  for (const tokenUrl of [
    "not-a-url",
    "http://auth.example.test/token",
    "https://user:password@auth.example.test/token",
  ]) {
    assert.throws(
      () =>
        validateProjectConfig({
          version: 1,
          auth: { example: { ...profile, tokenUrl } },
        }),
      /Auth profile "example" tokenUrl must be a valid HTTPS URL/u,
    );
  }

  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: { example: { ...profile, scope: " " } },
      }),
    /Auth profile "example" scope must be a non-empty string/u,
  );

  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: { example: { ...profile, clientId: { env: "" } } },
      }),
    /Auth profile "example" clientId must reference a non-empty environment variable/u,
  );

  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: { example: { ...profile, clientSecret: { kv: "" } } },
      }),
    /Auth profile "example" clientSecret must reference a non-empty Key Vault secret name/u,
  );
});

test("rejects unsupported auth profile types", () => {
  assert.throws(
    () =>
      validateProjectConfig({
        version: 1,
        auth: {
          service: {
            type: "oauth2",
          },
        },
      }),
    /Auth profile "service" has an unsupported type/,
  );
});
