import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { executeRequest } from "../core/execute-request.js";
import type {
  RequestBody,
  RequestDefinition,
} from "../core/request.js";

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

test("executes a request with headers and query overrides", async (context) => {
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

  const { response, body, durationMs } = await executeRequest(request, {
    auth: {
      location: "query",
      name: "apiKey",
      value: "resolved-secret",
    },
    queryOverrides: new Map([
      ["existing", "replaced"],
      ["include", "summary"],
      ["page", "2"],
      ["apiKey", "cli-value"],
    ]),
  });

  assert.equal(receivedMethod, "GET");
  assert.equal(receivedHeader, "transport");
  assert.equal(
    receivedUrl,
    "/users?existing=replaced&include=summary&limit=10&page=2&apiKey=resolved-secret",
  );

  assert.equal(response.status, 201);
  assert.equal(
    response.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.deepStrictEqual(body, new Uint8Array([0x00, 0x7f, 0xff]));
  assert.ok(durationMs >= 0);
});

test("sends each supported request body", async (context) => {
  interface RecordedRequest {
    body: Buffer;
    contentType: string | undefined;
  }

  const recordedRequests: RecordedRequest[] = [];

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      recordedRequests.push({
        body: Buffer.concat(chunks),
        contentType: request.headers["content-type"],
      });

      response.writeHead(204);
      response.end();
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await mkdtemp(
    join(tmpdir(), "reqs-execute-request-"),
  );

  context.after(() =>
    rm(directory, {
      recursive: true,
      force: true,
    }),
  );

  const requestFilePath = join(directory, "request.json");
  const payloadPath = join(directory, "payload.bin");
  const fileBody = Buffer.from([0x00, 0x7f, 0xff]);

  await writeFile(payloadPath, fileBody);

  const url = `http://127.0.0.1:${address.port}/body`;

  function requestWithBody(
    body: RequestBody,
    headers?: Record<string, string>,
  ): RequestDefinition {
    const request: RequestDefinition = {
      version: 1,
      method: "POST",
      url,
      body,
    };

    if (headers !== undefined) {
      request.headers = headers;
    }

    return request;
  }

  await executeRequest(
    requestWithBody({
      type: "json",
      value: { name: "Grace", enabled: true },
    }),
  );

  await executeRequest(
    requestWithBody(
      {
        type: "text",
        value: "hello",
      },
      {
        "Content-Type": "application/x-custom-text",
      },
    ),
  );

  await executeRequest(
    requestWithBody({
      type: "form",
      fields: {
        name: "Grace Hopper",
        role: "admin",
      },
    }),
  );

  await executeRequest(
    requestWithBody({
      type: "file",
      path: "./payload.bin",
    }),
    { requestFilePath },
  );

  assert.equal(recordedRequests.length, 4);

  assert.deepStrictEqual(
    recordedRequests[0],
    {
      body: Buffer.from('{"name":"Grace","enabled":true}'),
      contentType: "application/json",
    },
  );

  assert.deepStrictEqual(
    recordedRequests[1],
    {
      body: Buffer.from("hello"),
      contentType: "application/x-custom-text",
    },
  );

  assert.deepStrictEqual(
    recordedRequests[2],
    {
      body: Buffer.from("name=Grace+Hopper&role=admin"),
      contentType: "application/x-www-form-urlencoded; charset=utf-8",
    },
  );

  assert.deepStrictEqual(
    recordedRequests[3],
    {
      body: fileBody,
      contentType: undefined,
    },
  );
});

test("rejects bodies on GET and HEAD requests", async () => {
  for (const method of ["GET", "HEAD"] as const) {
    await assert.rejects(
      executeRequest({
        version: 1,
        method,
        url: "https://example.com",
        body: {
          type: "text",
          value: "not allowed",
        },
      }),
      new RegExp(`${method} requests cannot have a body`),
    );
  }
});
