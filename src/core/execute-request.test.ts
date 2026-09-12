import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";

import { executeRequest } from "./execute-request.js";
import type { RequestDefinition } from "./request.js";

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

test("executes a request with headers and repeated query values", async (context) => {
  let receivedMethod: string | undefined;
  let receivedUrl: string | undefined;
  let receivedHeader: string | string[] | undefined;

  const server = createServer((request, response) => {
    receivedMethod = request.method;
    receivedUrl = request.url;
    receivedHeader = request.headers["x-reqs-test"];

    response.writeHead(201, {
      "Content-Type": "application/octet-stream",
    });
    response.end(Buffer.from([0x00, 0x7f, 0xff]));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const request: RequestDefinition = {
    version: 1,
    method: "GET",
    url: `http://127.0.0.1:${address.port}/users?existing=yes`,
    headers: {
      "X-Reqs-Test": "transport",
    },
    query: {
      include: ["profile", "teams"],
      limit: "10",
    },
  };

  const { response, body, durationMs } = await executeRequest(request);

  assert.equal(receivedMethod, "GET");
  assert.equal(receivedHeader, "transport");
  assert.equal(
    receivedUrl,
    "/users?existing=yes&include=profile&include=teams&limit=10",
  );

  assert.equal(response.status, 201);
  assert.equal(
    response.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.deepStrictEqual(body, new Uint8Array([0x00, 0x7f, 0xff]));
  assert.ok(durationMs >= 0);
});
