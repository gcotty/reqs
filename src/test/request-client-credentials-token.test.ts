import assert from "node:assert/strict";
import { test } from "node:test";

import {
  requestClientCredentialsToken,
  type ClientCredentialsTokenRequest,
} from "../core/request-client-credentials-token.js";

const request: ClientCredentialsTokenRequest = {
  tokenUrl: "https://auth.example.test/connect/token",
  scope: "api.read api.write",
  clientId: "client+id",
  clientSecret: "secret&value=1",
};

test("sends client credentials as form data and returns a Bearer token", async () => {
  const token = await requestClientCredentialsToken(
    request,
    async (input, init) => {
      assert.equal(String(input), request.tokenUrl);
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(
        new Headers(init?.headers).get("Content-Type"),
        "application/x-www-form-urlencoded",
      );
      assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
      assert.ok(init?.signal);
      assert.ok(init.body instanceof URLSearchParams);
      assert.deepStrictEqual(Object.fromEntries(init.body), {
        grant_type: "client_credentials",
        client_id: "client+id",
        client_secret: "secret&value=1",
        scope: "api.read api.write",
      });
      assert.match(init.body.toString(), /client_secret=secret%26value%3D1/u);

      return new Response(
        JSON.stringify({ access_token: "example-token", token_type: "bearer", expires_in: 3600 }),
        { status: 200 },
      );
    },
  );

  assert.deepStrictEqual(token, { accessToken: "example-token", expiresIn: 3600 });
});

test("leaves tokens without a usable lifetime uncached", async () => {
  for (const expiresIn of [undefined, 0, -1, "unknown", null]) {
    const token = await requestClientCredentialsToken(request, async () =>
      new Response(JSON.stringify({
        access_token: "example-token",
        token_type: "Bearer",
        expires_in: expiresIn,
      })),
    );

    assert.deepStrictEqual(token, { accessToken: "example-token", expiresIn: undefined });
  }
});

test("rejects token URLs that are not HTTPS or contain credentials", async () => {
  let fetchCalled = false;
  const fetcher: typeof fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };

  for (const tokenUrl of [
    "not-a-url",
    "http://auth.example.test/token",
    "https://user:password@auth.example.test/token",
  ]) {
    await assert.rejects(
      requestClientCredentialsToken({ ...request, tokenUrl }, fetcher),
      { message: "OAuth token URL must be a valid HTTPS URL" },
    );
  }

  assert.equal(fetchCalled, false);
});

test("does not expose token endpoint errors or network error details", async () => {
  await assert.rejects(
    requestClientCredentialsToken(
      request,
      async () =>
        new Response("client_secret=secret&value=1", { status: 401 }),
    ),
    { message: "OAuth token request failed with status 401" },
  );

  await assert.rejects(
    requestClientCredentialsToken(request, async () => {
      throw new Error("client_secret=secret&value=1");
    }),
    { message: "OAuth token request failed" },
  );
});

test("rejects malformed JSON and responses without a valid Bearer token", async () => {
  await assert.rejects(
    requestClientCredentialsToken(request, async () => new Response("not JSON")),
    { message: "OAuth token response was not valid JSON" },
  );

  for (const payload of [
    {},
    { access_token: "example-token", token_type: "MAC" },
    { access_token: "bad\nvalue", token_type: "Bearer" },
  ]) {
    await assert.rejects(
      requestClientCredentialsToken(
        request,
        async () => new Response(JSON.stringify(payload)),
      ),
      { message: "OAuth token response was missing a Bearer access token" },
    );
  }
});
