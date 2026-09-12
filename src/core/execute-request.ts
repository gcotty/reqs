import type { RequestDefinition } from "./request.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ExecutedResponse {
  response: Response;
  body: Uint8Array;
  durationMs: number;
}

export async function executeRequest(
  request: RequestDefinition,
): Promise<ExecutedResponse> {
  if (request.auth !== undefined) {
    throw new Error("Authentication is not supported yet");
  }

  if (request.vars !== undefined) {
    throw new Error("Variables are not supported yet");
  }

  if (request.body !== undefined) {
    throw new Error("Request bodies are not supported yet");
  }

  const url = new URL(request.url);

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

  const options: RequestInit = {
    method: request.method,
    redirect: "manual",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  };

  if (request.headers !== undefined) {
    options.headers = request.headers;
  }

  const startedAt = performance.now();
  const response = await fetch(url, options);
  const body = new Uint8Array(await response.arrayBuffer());
  const durationMs = performance.now() - startedAt;

  return {
    response,
    body,
    durationMs,
  };
}
