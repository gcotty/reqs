import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../cli.js", import.meta.url));

interface CliResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: string;
}

function runCli(
  args: string[],
  envOverrides: Record<string, string> = {},
  workingDirectory?: string,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const childEnvironment = {
      ...process.env,
      ...envOverrides,
    };
    delete childEnvironment["NODE_TEST_CONTEXT"];

    const child = spawn(process.execPath, [cliPath, ...args], {
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      ...(workingDirectory === undefined ? {} : { cwd: workingDirectory }),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.once("error", reject);

    child.once("close", (exitCode, signal) => {
      if (signal !== null) {
        reject(new Error(`CLI terminated with signal ${signal}`));
        return;
      }

      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

async function createTempDirectory(
  context: TestContext,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "reqs-cli-"));

  context.after(() =>
    rm(directory, {
      recursive: true,
      force: true,
    }),
  );

  return directory;
}

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

async function startServer(
  context: TestContext,
  statusCode: number,
  responseBody: Uint8Array,
  contentType = "application/octet-stream",
): Promise<number> {
  const server = createServer((_request, response) => {
    response.writeHead(statusCode, {
      "Content-Type": contentType,
    });
    response.end(responseBody);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  return address.port;
}

test("reports a missing request-file argument", async () => {
  const result = await runCli(["run"]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout.length, 0);
  assert.equal(
    result.stderr,
    "Usage: reqs run <file|name> [--path name=value] [--query name=value]\n",
  );
});

test("lists nested saved requests by name", async (context) => {
  const directory = await createTempDirectory(context);
  const requestsDirectory = join(directory, "requests");
  const nestedDirectory = join(requestsDirectory, "nba");

  await mkdir(nestedDirectory, { recursive: true });
  await writeFile(join(requestsDirectory, "root.json"), "{}");
  await writeFile(join(nestedDirectory, "z.json"), "{}");
  await writeFile(join(nestedDirectory, "a.json"), "{}");
  await writeFile(join(nestedDirectory, "notes.txt"), "ignored");

  const result = await runCli(["list"], {}, directory);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.toString("utf8"), "nba/a\nnba/z\nroot\n");

  const invalid = await runCli(["list", "extra"], {}, directory);

  assert.equal(invalid.exitCode, 2);
  assert.equal(invalid.stderr, "Usage: reqs list\n");
});

test("initializes a project and leaves it unchanged on a second run", async (context) => {
  const directory = await createTempDirectory(context);

  const first = await runCli(["init"], {}, directory);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(
    first.stdout.toString("utf8"),
    "Created reqs.json\nCreated requests/\nCreated .gitignore\n",
  );
  assert.equal(
    await readFile(join(directory, "reqs.json"), "utf8"),
    '{\n  "version": 1\n}\n',
  );
  assert.equal(
    await readFile(join(directory, ".gitignore"), "utf8"),
    "/reqs.json\nrequests/\n.reqs/\n",
  );
  assert.equal((await stat(join(directory, "requests"))).isDirectory(), true);

  const second = await runCli(["init"], {}, directory);

  assert.equal(second.exitCode, 0);
  assert.equal(second.stderr, "");
  assert.equal(second.stdout.toString("utf8"), "Already initialized\n");
});

test("preserves existing project files and adds only missing ignore rules", async (context) => {
  const directory = await createTempDirectory(context);
  const config = '{"version":1,"auth":{"saved":"custom"}}\n';
  const request = '{"saved":true}\n';
  const requestsDirectory = join(directory, "requests");

  await mkdir(requestsDirectory);
  await writeFile(join(directory, "reqs.json"), config);
  await writeFile(join(requestsDirectory, "keep.json"), request);
  await writeFile(join(directory, ".gitignore"), "node_modules/\n/reqs.json\n");

  const result = await runCli(["init"], {}, directory);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "Updated .gitignore\n");
  assert.equal(await readFile(join(directory, "reqs.json"), "utf8"), config);
  assert.equal(
    await readFile(join(requestsDirectory, "keep.json"), "utf8"),
    request,
  );
  assert.equal(
    await readFile(join(directory, ".gitignore"), "utf8"),
    "node_modules/\n/reqs.json\nrequests/\n.reqs/\n",
  );
});

test("rejects conflicting init paths before creating files", async (context) => {
  const directory = await createTempDirectory(context);
  await writeFile(join(directory, "requests"), "not a directory");

  const result = await runCli(["init"], {}, directory);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /Expected .*requests to be a directory/);
  await assert.rejects(
    readFile(join(directory, "reqs.json"), "utf8"),
    /ENOENT/,
  );
  await assert.rejects(
    readFile(join(directory, ".gitignore"), "utf8"),
    /ENOENT/,
  );
});

test("reports extra init arguments", async (context) => {
  const directory = await createTempDirectory(context);
  const result = await runCli(["init", "extra"], {}, directory);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr, "Usage: reqs init\n");
});

test("reports invalid query override arguments", async () => {
  const missingValue = await runCli([
    "run",
    "request.json",
    "--query",
  ]);
  const missingName = await runCli([
    "run",
    "request.json",
    "--query",
    "=value",
  ]);

  assert.equal(missingValue.exitCode, 2);
  assert.equal(missingValue.stdout.length, 0);
  assert.match(missingValue.stderr, /--query requires name=value/);

  assert.equal(missingName.exitCode, 2);
  assert.equal(missingName.stdout.length, 0);
  assert.match(
    missingName.stderr,
    /--query requires a non-empty name in name=value/,
  );
});

test("reports invalid path override arguments", async () => {
  const cases = [
    { args: ["--path"], message: /--path requires name=value/ },
    {
      args: ["--path", "=value"],
      message: /--path requires a non-empty name in name=value/,
    },
    {
      args: ["--path", "name"],
      message: /--path requires a non-empty name in name=value/,
    },
    {
      args: ["--path", "name="],
      message: /--path requires a non-empty value in name=value/,
    },
  ];

  for (const { args, message } of cases) {
    const result = await runCli(["run", "request.json", ...args]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr, message);
  }
});

test("reports an invalid request definition", async (context) => {
  const directory = await createTempDirectory(context);
  const filePath = join(directory, "invalid-request.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 2,
      method: "GET",
      url: "https://example.com",
    }),
    "utf8",
  );

  const result = await runCli(["run", filePath]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout.length, 0);
  assert.match(
    result.stderr,
    /Failed to run request: Request version must be 1/,
  );
});

test("writes response bytes to stdout and status to stderr", async (context) => {
  const responseBody = new Uint8Array([0x00, 0x7f, 0xff]);
  const port = await startServer(context, 200, responseBody);

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${port}/users`,
    }),
    "utf8",
  );

  const result = await runCli(["run", filePath]);

  assert.equal(result.exitCode, 0);
  assert.deepStrictEqual(result.stdout, Buffer.from(responseBody));
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/);
});

test("replaces or adds query parameters with last-value-wins", async (context) => {
  let receivedUrl: string | undefined;

  const server = createServer((request, response) => {
    receivedUrl = request.url;
    response.writeHead(200);
    response.end("ok");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${address.port}/games?gameId=url-old&preserved=url`,
      query: {
        gameId: ["saved-old-one", "saved-old-two"],
        format: "json",
      },
    }),
    "utf8",
  );

  const result = await runCli([
    "run",
    filePath,
    "--query",
    "gameId=first",
    "--query",
    "new=value=with=equals",
    "--query",
    "empty=",
    "--query",
    "gameId=final",
  ]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "ok");
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/);
  if (receivedUrl === undefined) {
    throw new Error("Test server did not receive the request");
  }

  const query = new URL(receivedUrl, "http://127.0.0.1").searchParams;

  assert.deepStrictEqual(query.getAll("gameId"), ["final"]);
  assert.deepStrictEqual(query.getAll("preserved"), ["url"]);
  assert.deepStrictEqual(query.getAll("format"), ["json"]);
  assert.deepStrictEqual(query.getAll("new"), ["value=with=equals"]);
  assert.deepStrictEqual(query.getAll("empty"), [""]);
});

test("mixes path and query overrides with last-value-wins", async (context) => {
  let receivedUrl: string | undefined;

  const server = createServer((request, response) => {
    receivedUrl = request.url;
    response.writeHead(200);
    response.end("ok");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");
  const savedRequest = JSON.stringify({
    version: 1,
    method: "GET",
    url: `http://127.0.0.1:${address.port}/games/{gameId}/copy/{gameId}_hustlestats.xml?kept=url`,
    query: { format: "json" },
  });

  await writeFile(filePath, savedRequest, "utf8");

  const result = await runCli([
    "run",
    filePath,
    "--path",
    "gameId=first",
    "--query",
    "new=first",
    "--path",
    "gameId=final=value",
    "--query",
    "new=last",
  ]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "ok");
  assert.equal(
    receivedUrl,
    "/games/final%3Dvalue/copy/final%3Dvalue_hustlestats.xml?kept=url&format=json&new=last",
  );
  assert.equal(await readFile(filePath, "utf8"), savedRequest);
});

test("runs a nested saved request by name", async (context) => {
  let receivedUrl: string | undefined;

  const server = createServer((request, response) => {
    receivedUrl = request.url;
    response.writeHead(200);
    response.end("ok");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const requestsDirectory = join(directory, "requests", "nba");
  await mkdir(requestsDirectory, { recursive: true });
  await writeFile(
    join(requestsDirectory, "hustle_stats.json"),
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${address.port}/games/{gameId}_stats.xml`,
    }),
  );

  const result = await runCli(
    ["run", "nba/hustle_stats", "--path", "gameId=123"],
    {},
    directory,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "ok");
  assert.equal(receivedUrl, "/games/123_stats.xml");
});

test("pretty-prints JSON responses to stdout", async (context) => {
  const responseBody = Buffer.from('{"users":[{"id":1,"active":true}]}');
  const port = await startServer(
    context,
    200,
    responseBody,
    "application/json; charset=utf-8",
  );

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${port}/users`,
    }),
    "utf8",
  );

  const result = await runCli(["run", filePath]);

  assert.equal(result.exitCode, 0);
  assert.equal(
    result.stdout.toString("utf8"),
    [
      "{",
      '  "users": [',
      "    {",
      '      "id": 1,',
      '      "active": true',
      "    }",
      "  ]",
      "}",
      "",
    ].join("\n"),
  );
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/);
});

test("returns exit code 1 while preserving an HTTP error body", async (context) => {
  const responseBody = Buffer.from("not found", "utf8");
  const port = await startServer(context, 404, responseBody);

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "missing.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${port}/missing`,
    }),
    "utf8",
  );

  const result = await runCli(["run", filePath]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout.toString("utf8"), "not found");
  assert.match(result.stderr, /^404 Not Found \(\d+ ms\)\n$/);
});

test("resolves a file body relative to the request file", async (context) => {
  let receivedBody: Buffer | undefined;
  let receivedContentType: string | undefined;

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      receivedBody = Buffer.concat(chunks);
      receivedContentType = request.headers["content-type"];

      response.writeHead(200);
      response.end("accepted");
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const filePath = join(directory, "request.json");
  const payloadPath = join(directory, "payload.bin");
  const payload = Buffer.from([0x00, 0x7f, 0xff]);

  await writeFile(payloadPath, payload);
  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      method: "POST",
      url: `http://127.0.0.1:${address.port}/upload`,
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: {
        type: "file",
        path: "./payload.bin",
      },
    }),
    "utf8",
  );

  const result = await runCli(["run", filePath]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "accepted");
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/);
  assert.deepStrictEqual(receivedBody, payload);
  assert.equal(receivedContentType, "application/octet-stream");
});

test("loads and applies a named API-key auth profile", async (context) => {
  let receivedApiKey: string | string[] | undefined;

  const server = createServer((request, response) => {
    receivedApiKey = request.headers["x-nba-api-key"];

    response.writeHead(200);
    response.end("authenticated");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const requestDirectory = join(directory, "requests", "nba");
  const requestFilePath = join(requestDirectory, "boxscore.json");
  const configFilePath = join(directory, "reqs.json");

  await mkdir(requestDirectory, { recursive: true });
  await writeFile(
    configFilePath,
    JSON.stringify({
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
    }),
    "utf8",
  );
  await writeFile(
    requestFilePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${address.port}/boxscore`,
      auth: "nba",
    }),
    "utf8",
  );

  const result = await runCli(["run", requestFilePath], {
    NBA_API_KEY: "integration-secret",
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "authenticated");
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/);
  assert.equal(receivedApiKey, "integration-secret");
});

test("runs a request with OAuth client credentials", async (context) => {
  let receivedAuthorization: string | undefined;

  const server = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization;
    response.writeHead(200);
    response.end("authenticated");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => closeServer(server));

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not listen on a TCP port");
  }

  const directory = await createTempDirectory(context);
  const requestFilePath = join(directory, "request.json");
  const tokenRecordPath = join(directory, "token-request.json");
  const fetchPreloadPath = join(directory, "mock-fetch.cjs");

  await writeFile(
    join(directory, "reqs.json"),
    JSON.stringify({
      version: 1,
      auth: {
        example: {
          type: "oauth2ClientCredentials",
          tokenUrl: "https://auth.example.test/connect/token",
          scope: "api.read",
          clientId: { env: "EXAMPLE_CLIENT_ID" },
          clientSecret: { env: "EXAMPLE_CLIENT_SECRET" },
        },
      },
    }),
  );
  await writeFile(
    requestFilePath,
    JSON.stringify({
      version: 1,
      method: "GET",
      url: `http://127.0.0.1:${address.port}/resource`,
      auth: "example",
    }),
  );
  await writeFile(
    fetchPreloadPath,
    `const { writeFileSync } = require("node:fs");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://auth.example.test/connect/token") {
    writeFileSync(process.env.REQS_TOKEN_RECORD, JSON.stringify({
      method: init.method,
      contentType: new Headers(init.headers).get("content-type"),
      body: String(init.body),
    }));
    if (process.env.REQS_TOKEN_STATUS === "401") {
      return new Response("sensitive token body", { status: 401 });
    }
    return new Response(JSON.stringify({
      access_token: "issued-token",
      token_type: "Bearer",
    }));
  }
  return originalFetch(input, init);
};
`,
  );

  const environment = {
    EXAMPLE_CLIENT_ID: "example-id",
    EXAMPLE_CLIENT_SECRET: "example-secret",
    NODE_OPTIONS: `--require=${fetchPreloadPath}`,
    REQS_TOKEN_RECORD: tokenRecordPath,
  };
  const result = await runCli(["run", requestFilePath], environment);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "authenticated");
  assert.match(result.stderr, /^200 OK \(\d+ ms\)\n$/u);
  assert.equal(receivedAuthorization, "Bearer issued-token");

  const tokenRequest = JSON.parse(await readFile(tokenRecordPath, "utf8")) as {
    method: string;
    contentType: string;
    body: string;
  };
  assert.equal(tokenRequest.method, "POST");
  assert.equal(tokenRequest.contentType, "application/x-www-form-urlencoded");
  assert.deepStrictEqual(Object.fromEntries(new URLSearchParams(tokenRequest.body)), {
    grant_type: "client_credentials",
    client_id: "example-id",
    client_secret: "example-secret",
    scope: "api.read",
  });

  const failure = await runCli(["run", requestFilePath], {
    ...environment,
    REQS_TOKEN_STATUS: "401",
  });

  assert.equal(failure.exitCode, 2);
  assert.equal(failure.stdout.length, 0);
  assert.equal(
    failure.stderr,
    "Failed to run request: OAuth token request failed with status 401\n",
  );
  assert.doesNotMatch(failure.stderr, /example-secret|sensitive token body/u);
});
