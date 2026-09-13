import assert from "node:assert/strict";
import { test } from "node:test";

import { applyResolvedAuth } from "../core/apply-resolved-auth.js";

test("applies header auth and replaces an existing credential", () => {
  const url = new URL("https://example.com/users?include=profile");
  const headers = new Headers({
    Authorization: "Bearer stale-token",
    Accept: "application/json",
  });

  applyResolvedAuth(url, headers, {
    location: "header",
    name: "Authorization",
    value: "Bearer current-token",
  });

  assert.equal(headers.get("Authorization"), "Bearer current-token");
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(url.searchParams.get("include"), "profile");
});

test("applies query auth and replaces all existing values", () => {
  const url = new URL(
    "https://example.com/users?api_key=old-one&api_key=old-two&include=profile",
  );
  const headers = new Headers({
    Accept: "application/json",
  });

  applyResolvedAuth(url, headers, {
    location: "query",
    name: "api_key",
    value: "current key",
  });

  assert.deepStrictEqual(url.searchParams.getAll("api_key"), [
    "current key",
  ]);
  assert.equal(url.searchParams.get("include"), "profile");
  assert.match(url.href, /api_key=current\+key/);
  assert.equal(headers.get("Accept"), "application/json");
});
