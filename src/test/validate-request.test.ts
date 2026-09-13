import assert from "node:assert/strict";
import { test } from "node:test";

import { validateRequest } from "../core/validate-request.js";

function minimalRequest() {
  return {
    version: 1,
    method: "GET",
    url: "https://example.com/users",
  };
}

test("accepts a minimal request", () => {
  const input = minimalRequest();

  assert.deepStrictEqual(validateRequest(input), input);
});

test("accepts optional fields and nested JSON", () => {
  const input = {
    ...minimalRequest(),
    method: "POST",
    auth: "API",
    vars: { enabled: true, limit: 10 },
    headers: { Accept: "application/json" },
    query: { include: ["profile", "teams"] },
    body: {
      type: "json",
      value: {
        name: "Grace",
        tags: ["admin"],
        settings: { enabled: true },
        manager: null,
      },
    },
  };

  assert.deepStrictEqual(validateRequest(input), input);
});

test("rejects values that are not request objects", () => {
  for (const input of [null, 42, "request", []]) {
    assert.throws(
      () => validateRequest(input),
      /Request must be a JSON object/,
    );
  }
});

test("rejects unsupported versions and methods", () => {
  assert.throws(
    () => validateRequest({ ...minimalRequest(), version: 2 }),
    /Request version/,
  );

  assert.throws(
    () => validateRequest({ ...minimalRequest(), method: "get" }),
    /Request method/,
  );
});

test("rejects non-string header values", () => {
  assert.throws(
    () =>
      validateRequest({ ...minimalRequest(), headers: { "X-Retry-Count": 3 } }),
    /Request headers/,
  );
});

test("rejects a body whose fields do not match its discriminator", () => {
  assert.throws(
    () =>
      validateRequest({
        ...minimalRequest(),
        body: {
          type: "json",
          path: "./photo.png",
        },
      }),
    /Request body/,
  );
});

test("rejects explicitly undefined optional properties", () => {
  assert.throws(
    () => validateRequest({ ...minimalRequest(), auth: undefined }),
    /Request auth/,
  );
});
