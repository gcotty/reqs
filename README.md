# reqs

A TypeScript CLI for reusable HTTP requests stored as JSON.

## Features

- `reqs init` creates `reqs.json`, `requests/`, and local Git ignore rules without overwriting existing files.
- `reqs list` shows saved requests; `reqs run` accepts a request name or file path.
- `--path name=value` fills URL placeholders such as `{gameId}`; `--query name=value` changes query parameters for one run.
- Requests support headers, repeated query values, JSON/text/form/file bodies, and named bearer, API-key, or OAuth 2.0 client-credentials auth profiles. Secrets come from environment variables or a `kv` executable.
- JSON responses are pretty-printed; other response bodies are preserved. Status and timing go to stderr.

## Quick start

```sh
pnpm install
pnpm build
pnpm reqs init
```

Save a request as `requests/example.json`:

```json
{
  "version": 1,
  "method": "GET",
  "url": "https://httpbin.org/get"
}
```

```sh
pnpm reqs list
pnpm reqs run example
pnpm reqs run requests/example.json
pnpm reqs run example --query page=2
```

Names are paths under `requests/` without `.json`, so `requests/personal/request.json` is `personal/request`. For path overrides, use a saved URL containing `{userId}` as a whole segment or within one, then run:

```sh
pnpm reqs run personal/request --path userId=123
```

## OAuth 2.0 client credentials

Add a profile to `reqs.json`:

```json
{
  "version": 1,
  "auth": {
    "example": {
      "type": "oauth2ClientCredentials",
      "tokenUrl": "https://auth.example.com/connect/token",
      "scope": "api.read",
      "clientId": { "env": "EXAMPLE_CLIENT_ID" },
      "clientSecret": { "env": "EXAMPLE_CLIENT_SECRET" }
    }
  }
}
```

Set those environment variables and add `"auth": "example"` to a saved request. `reqs run` stores tokens with an `expires_in` lifetime in the project's ignored `.reqs/` directory and reuses them across runs. It fetches a new token shortly before expiry or when the profile's token URL, scope, client ID, or client secret changes. Tokens without a usable `expires_in` are used once and are not cached.

OAuth requests require an HTTPS resource URL. Each profile has one cache file, named with a SHA-256 hash of the profile name. Renewals replace that file; cache files for removed profiles remain until you delete them from `.reqs/`.

## Development

```sh
pnpm typecheck
pnpm test
```
