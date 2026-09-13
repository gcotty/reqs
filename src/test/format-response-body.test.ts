import assert from "node:assert/strict";
import { test } from "node:test";
import { formatResponseBody } from "../core/format-response-body.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test("pretty-prints standard and structured JSON media types", () => {
  const body = encoder.encode('{"name":"Grace","roles":["admin","user"]}');
  const expected = [
    "{",
    '  "name": "Grace",',
    '  "roles": [',
    '    "admin",',
    '    "user"',
    "  ]",
    "}",
    "",
  ].join("\n");

  for (const contentType of [
    "application/json",
    "application/json; charset=utf-8",
    "application/problem+json",
  ]) {
    assert.equal(decoder.decode(formatResponseBody(body, contentType)), expected);
  }
});

test("preserves non-JSON and malformed JSON response bodies", () => {
  const binaryBody = new Uint8Array([0x00, 0x7f, 0xff]);
  const malformedJsonBody = encoder.encode('{"incomplete":');

  assert.strictEqual(
    formatResponseBody(binaryBody, "application/octet-stream"),
    binaryBody,
  );
  assert.strictEqual(
    formatResponseBody(malformedJsonBody, "application/json"),
    malformedJsonBody,
  );
});
