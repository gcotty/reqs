import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { applyResolvedAuth } from "./apply-resolved-auth.js";
import type { RequestBody, RequestDefinition } from "./request.js";
import type { ResolvedAuth } from "./resolve-auth.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ExecuteRequestOptions {
  auth?: ResolvedAuth;
  requestFilePath?: string;
}

export interface ExecutedResponse {
  response: Response;
  body: Uint8Array;
  durationMs: number;
}

interface PreparedBody {
  value: BodyInit;
  contentType?: string;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported request body: ${JSON.stringify(value)}`);
}

async function prepareBody(
  body: RequestBody,
  options: ExecuteRequestOptions,
): Promise<PreparedBody> {
  switch (body.type) {
    case "json":
      return {
        value: JSON.stringify(body.value),
        contentType: "application/json",
      };

    case "text":
      return {
        value: body.value,
        contentType: "text/plain; charset=utf-8",
      };

    case "form":
      return {
        value: new URLSearchParams(body.fields),
        contentType: "application/x-www-form-urlencoded; charset=utf-8",
      };

    case "file": {
      if (options.requestFilePath === undefined) {
        throw new Error("A request file path is required for file bodies");
      }

      const bodyPath = resolve(dirname(options.requestFilePath), body.path);

      return {
        value: await readFile(bodyPath),
      };
    }

    default:
      return assertNever(body);
  }
}

export async function executeRequest(
  request: RequestDefinition,
  options: ExecuteRequestOptions = {},
): Promise<ExecutedResponse> {
  if (request.auth !== undefined && options.auth === undefined) {
    throw new Error(`Auth profile "${request.auth}" was not resolved`);
  }

  if (request.vars !== undefined) {
    throw new Error("Variables are not supported yet");
  }

  if (
    request.body !== undefined &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    throw new Error(`${request.method} requests cannot have a body`);
  }

  const url = new URL(request.url);
  const headers = new Headers(request.headers);

  if (request.query !== undefined) {
    for (const [name, value] of Object.entries(request.query)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          url.searchParams.append(name, entry);
        }
      } else {
        url.searchParams.append(name, value);
      }
    }
  }

  if (options.auth !== undefined) {
    applyResolvedAuth(url, headers, options.auth);
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  };

  if (request.body !== undefined) {
    const preparedBody = await prepareBody(request.body, options);

    fetchOptions.body = preparedBody.value;

    if (
      preparedBody.contentType !== undefined &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", preparedBody.contentType);
    }
  }

  const startedAt = performance.now();
  const response = await fetch(url, fetchOptions);
  const body = new Uint8Array(await response.arrayBuffer());
  const durationMs = performance.now() - startedAt;

  return {
    response,
    body,
    durationMs,
  };
}
