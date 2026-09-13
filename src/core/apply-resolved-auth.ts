import type { ResolvedAuth } from "./resolve-auth.js";

function assertNever(value: never): never {
  throw new Error(`Unsupported resolved auth: ${JSON.stringify(value)}`);
}

export function applyResolvedAuth(
  url: URL,
  headers: Headers,
  auth: ResolvedAuth,
): void {
  switch (auth.location) {
    case "header":
      headers.set(auth.name, auth.value);
      return;

    case "query":
      url.searchParams.set(auth.name, auth.value);
      return;

    default:
      return assertNever(auth);
  }
}
