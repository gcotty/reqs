# reqs: v1 specification and implementation notes

## Purpose

Build a personal TypeScript CLI for reusable HTTP requests stored as JSON. Users should be able to revisit requests, change parameters, switch environments, manage authentication and token refresh, and optionally save responses.

Working name: `reqs`. Package and executable name availability has not been checked. Python was initially considered; TypeScript is the chosen implementation language.

This document records the intended design, not a claim that every feature exists. Exact configuration schemas and unsettled details should be reviewed when their phase begins.

## Collaboration and learning workflow

- The user implements the code as a TypeScript learning exercise.
- Present one file at a time, explain its purpose and relevant TypeScript concepts, and allow questions and review before moving on.
- Do not implement future files automatically. Documentation edits may be explicitly delegated, as this file was.
- Prefer a small working path, then expand it. Avoid introducing frameworks or abstractions before they help.
- Use pnpm for installation and scripts.
- Commit coherent working milestones after appropriate checks pass. The user handles commits and pushes unless explicitly delegating them.

## Current checkpoint

Inspected on 2026-09-13:

| File | Current behavior |
| --- | --- |
| `package.json` | Private ESM package; `reqs` bin points to `dist/cli.js`; includes build, repo-local CLI, typecheck, and test scripts |
| `pnpm-lock.yaml` | Committed dependency lockfile |
| `tsconfig.json` | Strict NodeNext compilation, ES2022 target, `src` to `dist` |
| `.gitignore` | Ignores dependencies, build output, local history, environment files, the root `reqs.json`, and the local personal `requests/` directory; allows `.env.example` |
| `reqs.json` | Ignored local project config; it may contain real environment-variable or Key Vault secret names without committing them |
| `README.md` | Documents setup, repo-local CLI usage, placeholder templates, personal request storage, request shapes, limitations, and development checks |
| `examples/reqs.example.json` | Tracked placeholder project config showing environment-variable and Key Vault secret references |
| `examples/httpbin.json` | Tracked placeholder request showing how a request selects an auth profile |
| `src/core/request.ts` | HTTP methods, recursive JSON values, body union, and request definition |
| `src/cli.ts` | `run <file>` parses temporary query overrides, loads and validates the request and nearest project config, resolves named auth, executes the request, pretty-prints valid JSON responses to stdout, and writes status and timing to stderr |
| `src/core/format-response-body.ts` | Pretty-prints valid `application/json` and `+json` response bodies while preserving all other bytes |
| `src/core/load-request.ts` | Reads UTF-8 text and parses JSON, returning `Promise<unknown>` |
| `src/core/validate-request.ts` | Runtime validation using handwritten type guards |
| `src/core/project-config.ts` | Project config, environment and Key Vault secret references, and bearer/API-key auth profile types |
| `src/core/load-project-config.ts` | Finds the nearest ancestor `reqs.json`, parses it, and provides an empty v1 config when no file exists |
| `src/core/validate-project-config.ts` | Runtime validation for project config and supported auth profiles |
| `src/core/resolve-auth.ts` | Resolves bearer and API-key profiles from environment variables or a `kv` executable on `PATH` |
| `src/core/apply-resolved-auth.ts` | Applies resolved credentials to prepared headers or query parameters |
| `src/test/validate-request.test.ts` | Seven declared cases using hardcoded inputs and Node test/assert APIs |
| `src/test/load-request.test.ts` | Covers successful parsing, malformed JSON, and missing files using temporary directories |
| `src/core/execute-request.ts` | Executes requests with headers, saved and overridden query values, resolved auth, and JSON, text, form, or file bodies; uses a 30-second timeout, disables automatic redirects, buffers response bytes, and measures total response time |
| `src/test/execute-request.test.ts` | Uses a local HTTP server to cover transport behavior, query overrides, every body type, content-type precedence, relative file paths, and GET/HEAD body rejection |
| `src/test/cli.test.ts` | Runs the compiled CLI as a child process and covers argument and validation errors, query overrides, JSON and binary output behavior, relative file bodies, and environment-backed API-key auth end to end |
| `src/test/format-response-body.test.ts` | Covers standard and structured JSON media types plus preservation of non-JSON and malformed bodies |
| `src/test/*project-config.test.ts`, `src/test/resolve-auth.test.ts`, and `src/test/apply-resolved-auth.test.ts` | Cover project config discovery and validation, environment and Key Vault secret resolution, failure sanitization, and credential application |

The complete build and test commands completed successfully at this checkpoint. Nine test files declare 45 passing tests covering validation, loading, authentication, query overrides, output formatting, transport, and end-to-end CLI behavior. Transport and CLI tests use temporary loopback servers rather than public network services.

Tracked configuration and request examples now contain placeholders rather than live identifiers. The ignored root `reqs.json` and ignored `requests/` directory hold local working configuration and requests. The local `requests/nba/boxscores_traditional.json` request was run successfully through the `nba` profile using a Key Vault-backed API key; the live API returned `200 OK` with a valid JSON body. This is a manual usage check only; automated tests remain independent of public services.

The earlier loader typo has been corrected to `loadRequestJson`. The validator's type-only import now uses `./request.js`, consistent with the project's Node ESM import convention.

Authentication now works through named bearer and API-key profiles backed by environment variables or `{ "kv": "secret-name" }` references. A Key Vault reference executes the fixed `kv` helper without a shell, so `kv` must be a real executable available on `PATH`; a shell alias or function alone is not visible to `reqs`. The resolver captures the executable's stdout in memory, removes trailing line endings, and rejects command failures or empty values without exposing provider output. The CLI finds the nearest ancestor `reqs.json`, validates it, resolves the selected profile, and passes the resulting header or query credential to the executor. Auth application replaces conflicting saved credentials. OAuth 2.0, Basic, general command providers, caching, and refresh are not implemented.

The executor still deliberately rejects configured `vars` fields instead of silently sending unresolved values. It supports direct URLs; headers; repeated saved query values; temporary CLI query overrides; and JSON, text, form, or file bodies. A query override replaces all matching values from both the saved URL and `query` object, or adds the parameter when it is absent. Default body content types do not override an explicit header. File body paths resolve relative to the request JSON file. GET and HEAD bodies are rejected before sending. Valid responses identified by an `application/json` or `+json` media type are pretty-printed with two-space indentation and a trailing newline; non-JSON and malformed JSON bodies remain byte-for-byte unchanged. All errors caught by `run` currently exit with code 2, including auth, network, and timeout failures; separating those failures into the proposed exit codes remains future work.

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

### 1. Foundation — substantially complete

- Request types, package setup, strict compiler configuration, ignore rules.
- Minimal CLI entry point with help and error exit status.
- TypeScript concepts: literal types, recursive types, discriminated unions, optional properties, type-only imports.

### 2. First request — working prototype complete

- Implemented: JSON loading and request validation with focused validator tests.
- Implemented: `run <file>` connects loading, validation, HTTP execution, pretty JSON or byte-preserving non-JSON response output, status/timing output, and HTTP failure exit status.
- Implemented: direct URLs, request headers, repeated query values, a finite timeout, disabled redirects, and binary-safe buffered response bodies.
- Implemented: JSON, text, URL-encoded form, and file request bodies, including default content types and explicit header precedence.
- Implemented: file body paths resolve relative to the request JSON file; GET and HEAD bodies are rejected.
- Current CLI handling covers missing arguments, unreadable files, invalid JSON, and invalid request definitions at the CLI boundary.
- Implemented: focused validation, loading, transport, and CLI tests using temporary local resources rather than external service dependencies.
- Remaining polish: distinguish network and timeout failures from configuration failures at the CLI boundary.
- During incremental implementation, reject unsupported configured features clearly rather than silently ignoring them.

### 3. Reuse

- Implemented: nearest-ancestor project config discovery and runtime validation.
- Implemented: temporary `--query name=value` overrides with last-value-wins behavior; saved request files are not modified.
- Remaining: named request discovery, `init`, and `list`.
- Remaining: named environments.
- Dry-run output with secrets redacted.

### 4. Authentication — initial profiles working

- Implemented: named bearer profiles using environment- or Key Vault-backed tokens.
- Implemented: named API-key profiles targeting a configured header or query parameter.
- Implemented: `{ "kv": "secret-name" }` references that safely execute the fixed `kv` helper and retain resolved secrets only in process memory.
- Implemented: project config discovery, validation, secret resolution, credential application, and an end-to-end CLI integration test.
- Next auth milestone: OAuth 2.0, initially covering refresh-token and client-credentials grants.
- Later: Basic and command-based providers.
- Remaining: local credential cache, expiration handling, refresh locking, atomic updates, and auth management commands.

### 5. Recording

- Body output to a file, opt-in response history, and history inspection.
- Binary-safe body storage and redacted metadata.

### 6. Finish

- Consistent exit codes and useful error messages.
- Focused integration tests, local executable setup, documentation, and packaging review.
- Verify the supported Node version and choose/pin compatible tooling before declaring v1 complete.

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
- Form bodies use URL-encoded fields; multipart is deferred.
- The current validator accepts extra properties. It reconstructs the top-level request from recognized fields.
- URL parsing happens during execution; the current validator only requires a nonempty string.
- The recursive JSON guard is intended for parsed JSON, not arbitrary cyclic JavaScript objects.
- A JSON Schema for editor assistance is a possible later addition; no schema file currently exists.

## Project and local state

Target layout:

```text
reqs.json
requests/
  users/
    get.json
    create.json
.reqs/
  history/
```

`reqs.json` currently supports `version: 1` and an optional `auth` object containing named bearer or API-key profiles. Bearer tokens and API-key values use either `{ "env": "VARIABLE_NAME" }` or `{ "kv": "secret-name" }` references. API keys specify `location: "header" | "query"` and a credential name. The nearest `reqs.json` at or above the request file is selected; a missing file behaves like `{ "version": 1 }`.

The root `reqs.json` is ignored because even secret names are treated as local information. A placeholder template is tracked at `examples/reqs.example.json`. Environment-backed secrets remain in the process environment; Key Vault-backed secrets travel from the `kv` helper's stdout into process memory and are not persisted by `reqs`. Future credential caches belong in local application state scoped by project, environment, and auth profile. Do not store tokens in committed configuration or request files.

## Target CLI

```sh
reqs init
reqs list
reqs run users/get --env dev
reqs run ./requests/users/get.json --env dev
reqs run users/get --query include=teams
reqs run ./requests/nba/boxscores_traditional.json --query gameId=2020900360
reqs run users/get --dry-run
reqs run users/get --output user.json
reqs run users/get --save-response
reqs run users/get --pretty
reqs auth status api --env dev
reqs auth refresh api --env dev
reqs auth clear api --env dev
reqs history users/get
reqs history show <run-id>
```

Query overrides affect only the current run. Users can edit JSON directly for other changes. Saving variants, an editor command, and automatic historical replay are deferred. Earlier brainstorming included `auth login`; interactive login is not part of the v1 commitment.

## Query overrides

`--query name=value` modifies the final outgoing query string without changing the saved request file.

- If the name exists in either the saved URL or `query` object, the override replaces all of its saved values.
- If the name does not exist, the override adds it.
- If the same name is passed more than once, the last CLI value wins.
- An empty value is valid, and values may contain additional `=` characters.
- URL query encoding is handled by `URLSearchParams`.
- Saved query arrays remain unchanged when their name is not overridden.
- Query-based auth is applied afterward and replaces a conflicting CLI value so a CLI override cannot replace a configured credential.
- Overrides are generic and request-defined rather than endpoint-specific. For example, `--query gameId=2020900360` replaces the saved `gameId` in `requests/nba/boxscores_traditional.json` for that invocation only; it does not modify the request file.

## Authentication and refresh

| Profile | Current status |
| --- | --- |
| Basic | Planned; username and password references |
| Bearer | Implemented with environment-variable or Key Vault token references |
| API key | Implemented for configured header or query placement with environment-variable or Key Vault value references |
| OAuth 2.0 | Next auth milestone; refresh-token and client-credentials grants |
| Command | Planned; explicit executable and argument list returning a token |

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

Command providers run an executable with arguments rather than a shell string. Proposed stdout contract:

```json
{
  "access_token": "...",
  "expires_at": "2026-09-07T18:00:00Z"
}
```

Auth providers should apply credentials, refresh when supported, and persist updated state:

1. Reuse valid cached credentials.
2. Refresh shortly before known expiration.
3. Lock refresh operations and atomically persist updates, including rotated refresh tokens.
4. On an eligible 401, permit at most one refresh and retry.
5. Automatically replay only GET/HEAD by default. Other methods require explicit request configuration and a replayable body.
6. Report refresh failures without indefinite retries.

OAuth 2.0 is the next authentication feature to implement. Refresh-token profiles initially accept a refresh token from a configured secret reference, and client-credentials profiles obtain an access token without interactive login. Browser login, PKCE, and device authorization are deferred. Exact profile fields, cache storage details, refresh skew, and replay opt-in syntax remain implementation decisions.

The `resolveAuth` API is asynchronous because Key Vault lookup performs child-process I/O. This also preserves the same caller contract when OAuth 2.0 and general command providers are added later. Resolved auth is represented separately from profile configuration and then applied to prepared headers or URL query parameters.

## Output, history, and transport

| Option | Behavior |
| --- | --- |
| Default | Pretty-print valid JSON responses to stdout; preserve other body bytes; write status and timing to stderr |
| `--output <path>` | Write response body bytes to a file |
| `--save-response` | Record body and metadata in local history |
| `--dry-run` | Show the resolved request with secrets redacted; do not execute auth commands or refresh |

Recorded metadata includes a run ID, timestamp, request name, environment, redacted resolved method/URL, status, response headers, duration, body filename, and a redacted request configuration snapshot. Store the body separately to support binary data.

Redact authorization and cookie headers and configured API-key locations. Saved response bodies remain as received, so response recording is opt-in.

Transport defaults: finite timeout, TLS verification enabled, redirects disabled unless requested, and no general automatic retries. The initial implementation uses Node's built-in `fetch` with a 30-second timeout, manual redirect handling, and an in-memory `Uint8Array` response body. Revisit buffering versus streaming before supporting potentially large response and output files. No CLI framework has been chosen.

Proposed exit codes:

| Code | Meaning |
| --- | --- |
| 0 | HTTP response below 400 |
| 1 | HTTP response 400 or above |
| 2 | Invalid configuration or CLI arguments |
| 3 | Network or timeout failure |
| 4 | Auth acquisition or refresh failure |

HTTP error responses still print or save their bodies. Handle loading and execution errors at the CLI boundary rather than printing from core helpers.

## Architecture

Keep argument parsing separate from the core:

```text
parse CLI → load → validate → resolve auth
          → execute (saved query → overrides → auth) → render / record
```

Use discriminated unions for request bodies and auth profiles, and runtime validation at external-data boundaries. The initial path can send one request at a time; asynchronous Node I/O does not require a concurrent runner.

## Definition of done

V1 is complete when a user can:

- Save a request as JSON and run it by path or name.
- Run it against two environments and override query parameters without editing the file.
- Use the agreed auth profiles and obtain or refresh credentials where supported.
- Pipe the response body into another command.
- Optionally write a body file or save and inspect response history.
- Receive predictable errors and exit codes.

Relevant checks must pass, and setup and usage must be documented. Advanced features are not prerequisites for this milestone.

## Longer-term possibilities

- Saved variants (`--save-as`) and an editor command.
- Template variables for changing other request fields without editing the file.
- Multipart uploads and cookie persistence.
- Collections and batch execution.
- Assertions and scripting hooks.
- Browser login, PKCE, and device authorization.
- Postman import.
- Historical replay with explicit stale-credential and side-effect semantics.
- TUI or web UI.
- Public package distribution and richer editor schema support.

These are possibilities, not commitments for v1.

## Resume here

Read this document and inspect the current files before proposing the next change. Preserve the one-file-at-a-time teaching workflow, but showing the complete contents of the current file is welcome. The user writes the implementation by hand unless they explicitly delegate an edit.

The direct-request, temporary query-override, and initial environment- and Key Vault-backed authentication checkpoints are complete. The root `reqs.json` and personal `requests/` directory are ignored; tracked examples contain placeholders only. `--query name=value` replaces every matching saved value or adds a missing parameter for one invocation, and the last CLI value wins when a name is repeated. Only query parameters are currently modifiable from the CLI; the executor continues to reject configured `vars`. Query-based auth is applied after overrides and therefore wins a name collision. The next authentication pass should implement OAuth 2.0, initially for refresh-token and client-credentials grants. The next reuse work is named environments, request discovery, `init`, and `list`. After those features, separate auth, network, and timeout failures from configuration failures; all currently exit with code 2.
