export interface ClientCredentialsTokenRequest {
  tokenUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
}

const TOKEN_TIMEOUT_MS = 10_000;

export async function requestClientCredentialsToken(
  request: ClientCredentialsTokenRequest,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let tokenUrl: URL;

  try {
    tokenUrl = new URL(request.tokenUrl);
  } catch {
    throw new Error("OAuth token URL must be a valid HTTPS URL");
  }

  if (
    tokenUrl.protocol !== "https:" ||
    tokenUrl.username !== "" ||
    tokenUrl.password !== ""
  ) {
    throw new Error("OAuth token URL must be a valid HTTPS URL");
  }

  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: request.clientId,
    client_secret: request.clientSecret,
    scope: request.scope,
  });

  let response: Response;

  try {
    response = await fetcher(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    throw new Error("OAuth token request failed");
  }

  if (!response.ok) {
    throw new Error(`OAuth token request failed with status ${response.status}`);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("OAuth token response was not valid JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("OAuth token response was missing a Bearer access token");
  }

  const fields = payload as Record<string, unknown>;
  const accessToken = fields["access_token"];
  const tokenType = fields["token_type"];

  if (
    typeof accessToken !== "string" ||
    accessToken === "" ||
    /[\u0000-\u001f\u007f]/u.test(accessToken) ||
    typeof tokenType !== "string" ||
    tokenType.toLowerCase() !== "bearer"
  ) {
    throw new Error("OAuth token response was missing a Bearer access token");
  }

  return accessToken;
}
