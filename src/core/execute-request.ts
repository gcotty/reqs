import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { applyResolvedAuth } from "./apply-resolved-auth.js";
import type { RequestBody, RequestDefinition } from "./request.js";
import type { ResolvedAuth } from "./resolve-auth.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ExecuteRequestOptions {
  auth?: ResolvedAuth;
  pathOverrides?: ReadonlyMap<string, string>;
  queryOverrides?: ReadonlyMap<string, string>;
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

function applyPathOverrides(
  url: URL,
  overrides: ReadonlyMap<string, string> = new Map(),
): void {
  const matchedNames = new Set<string>();
  const segments = url.pathname.split("/").map((segment) =>
    segment.replace(/%7B([^/]+?)%7D/gi, (_placeholder, encodedName: string) => {
      const name = decodeURIComponent(encodedName);
      matchedNames.add(name);
      const value = overrides.get(name);

      if (value === undefined) {
        throw new Error(`Missing path value for "${name}"`);
      }

      if (value === "" || value === "." || value === "..") {
        throw new Error(
          `Invalid path value for "${name}": must be non-empty and cannot be . or ..`,
        );
      }

      return encodeURIComponent(value);
    }),
  );

  for (const name of overrides.keys()) {
    if (!matchedNames.has(name)) {
      throw new Error(`Unknown path placeholder: "${name}"`);
    }
  }

  url.pathname = segments.join("/");
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

  if (
    options.auth?.location === "header" &&
    options.auth.requiresHttps === true &&
    url.protocol !== "https:"
  ) {
    throw new Error("OAuth requests require an HTTPS URL");
  }

  const headers = new Headers(request.headers);

  applyPathOverrides(url, options.pathOverrides);

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

  if (options.queryOverrides !== undefined) {
    for (const [name, value] of options.queryOverrides) {
      url.searchParams.set(name, value);
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
