# reqs: v1 specification and implementation notes

## Purpose

Build a personal TypeScript CLI for reusable HTTP requests stored as JSON. Users can revisit requests, change parameters for one run, and use named authentication profiles.

Working name: `reqs`. Package and executable name availability has not been checked. Python was initially considered; TypeScript is the chosen implementation language.

This document records the working CLI, the final v1 token-cache gate, and a small backlog after v1.

## Collaboration and learning workflow

- Treat changes as a TypeScript learning exercise: present one file at a time and allow review before moving on.
- Implement files when delegated, and explain the relevant choices.
- Prefer a small working path, then expand it. Avoid introducing frameworks or abstractions before they help.
- Use pnpm for installation and scripts.
- Commit coherent working milestones after appropriate checks pass. The user handles commits and pushes unless explicitly delegating them.

## Current checkpoint

Inspected on 2026-09-16:

| File | Current behavior |
| --- | --- |
| `package.json` | Private ESM package; `reqs` bin points to `dist/cli.js`; includes build, repo-local CLI, typecheck, and test scripts |
| `pnpm-lock.yaml` | Committed dependency lockfile |
| `tsconfig.json` | Strict NodeNext compilation, ES2022 target, `src` to `dist` |
| `.gitignore` | Ignores dependencies, build output, local application state, environment files, the root `reqs.json`, and the local personal `requests/` directory; allows `.env.example` |
| `reqs.json` | Ignored local project config; it may contain real environment-variable or Key Vault secret names without committing them |
| `README.md` | Briefly lists implemented features, quick-start commands, a minimal request, a generic OAuth profile, and development checks |
| `examples/reqs.example.json` | Tracked placeholder project config showing bearer, API-key, and OAuth client-credentials profiles with environment-variable and Key Vault secret references |
| `examples/httpbin.json` | Tracked placeholder request showing a path parameter and named OAuth profile |
| `src/core/request.ts` | HTTP methods, recursive JSON values, body union, and request definition |
| `src/cli.ts` | `init` creates local project files; `list` prints saved request names; `run <file|name>` accepts path and query overrides, resolves named requests and auth, executes the request, and writes the response and status |
| `src/core/format-response-body.ts` | Pretty-prints valid `application/json` and `+json` response bodies while preserving all other bytes |
| `src/core/init-project.ts` | Initializes a minimal local config and request directory, adds missing Git ignore rules, and leaves existing project content untouched |
| `src/core/load-request.ts` | Reads UTF-8 text and parses JSON, returning `Promise<unknown>` |
| `src/core/request-discovery.ts` | Resolves names under the current directory's `requests/` folder and lists nested JSON requests in sorted order |
| `src/core/validate-request.ts` | Runtime validation using handwritten type guards |
| `src/core/project-config.ts` | Project config, environment and Key Vault secret references, and bearer, API-key, and OAuth client-credentials auth profile types |
| `src/core/load-project-config.ts` | Finds the nearest ancestor `reqs.json`, parses it, and provides an empty v1 config when no file exists |
| `src/core/validate-project-config.ts` | Runtime validation for project config and supported auth profiles |
| `src/core/resolve-auth.ts` | Resolves bearer, API-key, and OAuth client-credentials profiles using environment variables or a `kv` executable on `PATH` |
| `src/core/request-client-credentials-token.ts` | Sends an HTTPS form-encoded token request and validates a Bearer token response |
| `src/core/apply-resolved-auth.ts` | Applies resolved credentials to prepared headers or query parameters |
| `src/test/validate-request.test.ts` | Seven declared cases using hardcoded inputs and Node test/assert APIs |
| `src/test/load-request.test.ts` | Covers successful parsing, malformed JSON, and missing files using temporary directories |
| `src/core/execute-request.ts` | Executes requests with headers, path and query overrides, resolved auth, and JSON, text, form, or file bodies; uses a 30-second timeout, disables automatic redirects, buffers response bytes, and measures total response time |
| `src/test/execute-request.test.ts` | Uses a local HTTP server to cover transport behavior, path and query overrides, every body type, content-type precedence, relative file paths, and GET/HEAD body rejection |
| `src/test/cli.test.ts` | Runs the compiled CLI as a child process and covers initialization, argument and validation errors, named requests and listing, overrides, response output, relative file bodies, and API-key and OAuth auth end to end |
| `src/test/format-response-body.test.ts` | Covers standard and structured JSON media types plus preservation of non-JSON and malformed bodies |
| `src/test/*project-config.test.ts`, `src/test/resolve-auth.test.ts`, `src/test/request-client-credentials-token.test.ts`, and `src/test/apply-resolved-auth.test.ts` | Cover project config discovery and validation, environment and Key Vault secret resolution, OAuth token exchange, failure sanitization, and credential application |

The latest TypeScript compilation and full automated suite passed: ten test files declare 64 passing tests. Transport and CLI tests use temporary loopback servers or mocked token responses rather than public network services. The user also confirmed that two live requests using the new OAuth profiles returned successfully; this is a manual usage check, not part of the automated suite.

Tracked configuration and request examples contain placeholders rather than live identifiers. The ignored root `reqs.json` and ignored `requests/` directory hold local working configuration and requests. An API-key request also succeeded in an earlier live manual check.

The earlier loader typo has been corrected to `loadRequestJson`. The validator's type-only import now uses `./request.js`, consistent with the project's Node ESM import convention.

Authentication works through named bearer, API-key, and OAuth 2.0 client-credentials profiles. Secret references use environment variables or `{ "kv": "secret-name" }`. A Key Vault reference executes the fixed `kv` helper without a shell, so `kv` must be a real executable available on `PATH`; a shell alias or function alone is not visible to `reqs`. The resolver captures stdout in memory, removes trailing line endings, and rejects command failures or empty values without exposing provider output. OAuth profiles currently exchange the resolved client ID and secret for a Bearer token on every run. The CLI finds the nearest ancestor `reqs.json`, validates it, resolves the selected profile, and passes the resulting header or query credential to the executor. Auth application replaces conflicting saved credentials. Persistent token caching is the final v1 gate.

The executor still deliberately rejects configured `vars` fields instead of silently sending unresolved values. It supports direct URLs; headers; repeated saved query values; temporary CLI query overrides; and JSON, text, form, or file bodies. A query override replaces all matching values from both the saved URL and `query` object, or adds the parameter when it is absent. Default body content types do not override an explicit header. File body paths resolve relative to the request JSON file. GET and HEAD bodies are rejected before sending. Valid responses identified by an `application/json` or `+json` media type are pretty-printed with two-space indentation and a trailing newline; non-JSON and malformed JSON bodies remain byte-for-byte unchanged. All errors caught by `run` currently exit with code 2, including auth, network, and timeout failures.

Earlier commits included `node_modules`; a later commit removed it from tracking. The user has pushed this history and explicitly accepts leaving it intact. Do not rewrite history to remove those paths.

## Development commands

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
node dist/cli.js --help
```

`typecheck` runs `tsc --noEmit`. `build` emits JavaScript into ignored local `dist/`. Source tests live under `src/test/`; `test` builds and runs their compiled `dist/test/*.test.js` files. The explicit compiled-output pattern prevents recent Node versions from discovering and attempting to execute the TypeScript source tests directly.

TypeScript checks authored code at compile time. It does not validate JSON read from disk. Runtime validation remains necessary after loading. Tests use fresh hardcoded values, temporary files and directories, local HTTP servers, and child CLI processes as appropriate to each boundary.

## Implementation phases

### 1. Foundation — complete

- Request types, package setup, strict compiler configuration, ignore rules.
- Minimal CLI entry point with help and error exit status.
- TypeScript concepts: literal types, recursive types, discriminated unions, optional properties, type-only imports.

### 2. First request — complete

- Implemented: JSON loading and request validation with focused validator tests.
- Implemented: `run <file>` connects loading, validation, HTTP execution, pretty JSON or byte-preserving non-JSON response output, status/timing output, and HTTP failure exit status.
- Implemented: direct URLs, request headers, repeated query values, a finite timeout, disabled redirects, and binary-safe buffered response bodies.
- Implemented: JSON, text, URL-encoded form, and file request bodies, including default content types and explicit header precedence.
- Implemented: file body paths resolve relative to the request JSON file; GET and HEAD bodies are rejected.
- Current CLI handling covers missing arguments, unreadable files, invalid JSON, and invalid request definitions at the CLI boundary.
- Implemented: focused validation, loading, transport, and CLI tests using temporary local resources rather than external service dependencies.

### 3. Reuse — complete

- Implemented: nearest-ancestor project config discovery and runtime validation.
- Implemented: temporary `--query name=value` overrides with last-value-wins behavior; saved request files are not modified.
- Implemented: URL path placeholders such as `/api/games/{gameId}` and `/api/games/{gameId}_stats.xml` with temporary `--path gameId=value` overrides; saved request files are not modified.
- Implemented: named request lookup under `requests/` and recursive `reqs list` output.
- Implemented: `reqs init` creates a minimal local project without overwriting existing files.

### 4. Authentication — token cache remaining for v1

- Implemented: named bearer profiles using environment- or Key Vault-backed tokens.
- Implemented: named API-key profiles targeting a configured header or query parameter.
- Implemented: `{ "kv": "secret-name" }` references that safely execute the fixed `kv` helper and retain resolved secrets only in process memory.
- Implemented: provider-neutral OAuth 2.0 client credentials with a configurable HTTPS token URL and scope, environment-variable or Key Vault client ID and secret references, and a Bearer token fetched for each run.
- Implemented: project config discovery, validation, secret resolution, credential application, and end-to-end CLI integration tests.

## Final v1 gate: OAuth token cache

`reqs run` starts a new process for each request, so an in-memory cache would
not help. Store client-credentials access tokens under the project's ignored
`.reqs/` directory with private file permissions. Reuse a token only while its
`expires_in` lifetime remains valid, with a short margin before expiry. Scope
the cache by project and profile, and invalidate it when the token URL, scope,
client ID, or client secret changes. Fetch a fresh token on a cache miss or
near expiry. If the token response has no usable `expires_in`, use the token
for that run without caching it. Keep tokens and credentials out of errors and
tracked files. Test reuse across separate CLI runs and renewal after expiry.

## Future work

- File saving: consider `--output <path>` if shell redirection is insufficient, especially to avoid truncating an existing file when a run fails before receiving a response.
- Response history: opt-in recording of response bodies and minimal redacted metadata, with commands to list and inspect saved runs.

## Request format

Request files are editable, versioned JSON and the source of truth. No database is needed for v1.

```json
{
  "version": 1,
  "method": "GET",
  "url": "https://example.com/users",
  "auth": "api",
  "query": {
    "include": ["profile", "teams"]
  },
  "headers": {
    "Accept": "application/json"
  }
}
```

- Methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS.
- Required fields: `version: 1`, `method`, and nonempty `url`.
- Optional fields: `auth`, `vars`, `query`, `headers`, and `body`.
- `auth` names a profile rather than embedding credentials.
- Headers contain strings; query values are strings or arrays of strings.
- The validator currently accepts `vars` containing JSON values, but execution rejects them because variable substitution is not implemented.
- Bodies form a discriminated union:
  - `{ "type": "json", "value": ... }`
  - `{ "type": "text", "value": "..." }`
  - `{ "type": "form", "fields": { "key": "value" } }`
  - `{ "type": "file", "path": "./payload.bin" }`
- Form bodies use URL-encoded fields; multipart is not supported.
- The current validator accepts extra properties. It reconstructs the top-level request from recognized fields.
- URL parsing happens during execution; the current validator only requires a nonempty string.
- The recursive JSON guard is intended for parsed JSON, not arbitrary cyclic JavaScript objects.

## Project and local state

Local layout:

```text
reqs.json
requests/
  users/
    get.json
    create.json
```

`reqs.json` supports `version: 1` and an optional `auth` object containing named bearer, API-key, or OAuth 2.0 client-credentials profiles. Bearer tokens, API-key values, and OAuth client IDs and secrets use either `{ "env": "VARIABLE_NAME" }` or `{ "kv": "secret-name" }` references. OAuth scopes and token URLs belong to the profile; a request selects it with `"auth": "profile-name"`. API keys specify `location: "header" | "query"` and a credential name. The nearest `reqs.json` at or above the request file is selected; a missing file behaves like `{ "version": 1 }`.

The root `reqs.json` is ignored because even secret names are treated as local information. A placeholder template is tracked at `examples/reqs.example.json`. Environment-variable-backed secrets remain in the process environment; Key Vault-backed secrets travel from the `kv` helper's stdout into process memory and are not persisted by `reqs`. Do not store tokens in committed configuration or request files.

## CLI

```sh
reqs init
reqs list
reqs run users/get
reqs run ./requests/users/get.json
reqs run users/get --query include=teams
reqs run users/get --path userId=123
reqs run users/get > response.json
```

`init`, `list`, `run`, and the `--path` and `--query` run options are implemented. Status and timing go to stderr, so shell redirection saves the response body. Path and query overrides affect only the current run; users edit JSON directly for persistent changes.

## Named requests

From the project directory, `reqs run users/get` loads
`requests/users/get.json`. `reqs list` prints the names of JSON files under
`requests/`, including nested folders, in sorted order. Explicit file paths
remain valid, and an existing direct file takes precedence over a name.

## Project initialization

`reqs init` works in the current directory. It creates `reqs.json` containing
`{ "version": 1 }` and an empty `requests/` directory when they are absent. It
adds missing `/reqs.json`, `requests/`, and `.reqs/` rules to `.gitignore`,
preserving existing content. Existing config and request files are not
overwritten, and a second run reports that the project is already initialized.
Conflicting paths, such as a regular file named `requests`, are errors.

## URL path overrides

Request URLs may contain named path placeholders wrapped in braces. A placeholder
can occupy a whole path segment or appear within one, as in
`/{gameId}_stats.xml`. A temporary `--path name=value` option replaces a
matching placeholder for one invocation without changing the saved request file:

```json
{
  "version": 1,
  "method": "GET",
  "url": "https://example.com/api/games/{gameId}"
}
```

```sh
reqs run games/get --path gameId=123
```

- Each supplied name must match a placeholder in the URL path; unknown names are
  errors rather than silently becoming query parameters.
- Every placeholder must have a value before execution. Missing values are
  errors. Empty values, `.` and `..` are also rejected.
- Placeholder values are encoded as one URL path segment, so values containing
  `/`, `?`, `#`, spaces, or other reserved characters cannot change the URL
  structure.
- If the same name appears more than once in the path, every occurrence is
  replaced. If the CLI supplies the same name more than once, the last value
  wins.
- Path overrides affect only the path. Existing URL query parameters and the
  request's `query` object retain their current behavior.
- Braced names are replaceable; ordinary path text without braces remains
  literal. Both `/games/{gameId}` and `/games/{gameId}_stats.xml` work.

## Query overrides

`--query name=value` modifies the final outgoing query string without changing the saved request file.

- If the name exists in either the saved URL or `query` object, the override replaces all of its saved values.
- If the name does not exist, the override adds it.
- If the same name is passed more than once, the last CLI value wins.
- An empty value is valid, and values may contain additional `=` characters.
- URL query encoding is handled by `URLSearchParams`.
- Saved query arrays remain unchanged when their name is not overridden.
- Query-based auth is applied afterward and replaces a conflicting CLI value so a CLI override cannot replace a configured credential.
- Overrides are generic and request-defined rather than endpoint-specific. For example, `--query page=2` replaces a saved `page` value for that invocation only; it does not modify the request file.

## Authentication

| Profile | Current status |
| --- | --- |
| Bearer | Implemented with environment-variable or Key Vault token references |
| API key | Implemented for configured header or query placement with environment-variable or Key Vault value references |
| OAuth 2.0 | Client credentials implemented; a token is fetched for each run |

Example secret references:

```json
{
  "type": "bearer",
  "token": { "env": "API_TOKEN" }
}
```

```json
{
  "type": "apiKey",
  "location": "header",
  "name": "X-API-Key",
  "value": { "kv": "your-key-vault-secret-name" }
}
```

Key Vault references execute `kv secret-name` directly with an argument array,
not through a shell. The helper must be a real executable available on `PATH`;
a shell alias or function alone will not work. It must accept exactly one secret
name, return a nonzero status on failure, and write only the secret value to
stdout.

The implemented OAuth 2.0 client credentials profile configures a token URL,
scope, and client ID and secret references using the existing environment
variable or Key Vault forms. Requests select a profile by name, such as
`"auth": "example"`. The profile shape is:

```json
{
  "type": "oauth2ClientCredentials",
  "tokenUrl": "https://auth.example.com/connect/token",
  "scope": "api.read",
  "clientId": { "env": "EXAMPLE_CLIENT_ID" },
  "clientSecret": { "env": "EXAMPLE_CLIENT_SECRET" }
}
```

The token URL must use HTTPS and must not contain embedded credentials. Each
run sends `grant_type=client_credentials`, `client_id`, `client_secret`, and
`scope` as `application/x-www-form-urlencoded` data. Redirects are rejected.
The response must be JSON with a nonempty `access_token` and Bearer
`token_type`. The resulting `Authorization: Bearer` header is applied to the
request. Currently each invocation obtains a new token; `expires_in` is not
used yet. Token request errors omit credentials and response bodies. Two live
OAuth requests have returned successfully with separate profile values.

The `resolveAuth` API is asynchronous because Key Vault lookup and OAuth token
acquisition perform I/O. Resolved auth is represented separately from profile
configuration and then applied to prepared headers or URL query parameters.

## Output and transport

Valid JSON responses are pretty-printed to stdout. Other response bodies are
preserved as bytes. Status and timing go to stderr, so `>` can save a response
body without including the status line. HTTP error response bodies are also
written to stdout.

Node's built-in `fetch` uses a 30-second request timeout, TLS verification,
disabled redirects, no automatic retries, and an in-memory `Uint8Array`
response body. OAuth token acquisition has a 10-second timeout.

Current exit codes:

| Code | Meaning |
| --- | --- |
| 0 | HTTP response below 400 |
| 1 | HTTP response 400 or above |
| 2 | CLI, configuration, auth acquisition, network, or timeout error |

## Architecture

Keep argument parsing separate from the core:

```text
parse CLI → load → validate → resolve auth
          → execute (saved query → overrides → auth) → render
```

Use discriminated unions for request bodies and auth profiles, and runtime validation at external-data boundaries. The CLI sends one request at a time.

## V1 completion

The current CLI lets a user:

- Save a request as JSON and run it by path or name.
- Override path and query parameters for one run without editing the file.
- Use bearer, API-key, and OAuth 2.0 client credentials profiles.
- Pipe or redirect the response body while status and timing go to stderr.
- Distinguish HTTP error responses from CLI or execution errors by exit code.

The automated suite passed with 64 tests, and live OAuth requests succeeded.
V1 is complete after the persistent OAuth token cache is implemented and
verified. File saving and response history remain outside v1.

## Resume here

Read this document and inspect the current files before proposing the next change. Preserve the one-file-at-a-time review workflow.

The current CLI supports the endpoint collection and testing workflow. The
root `reqs.json` and personal `requests/` directory are ignored; tracked
examples contain placeholders only. OAuth profiles obtain a fresh token for
each run. Implement persistent OAuth token caching as the final v1 gate, then
consider file saving and opt-in response history. Shell redirection already
saves stdout, so `--output` should be added only if its file handling provides
a clear benefit.
