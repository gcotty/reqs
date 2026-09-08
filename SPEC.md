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

Inspected on 2026-09-07:

| File | Current behavior |
| --- | --- |
| `package.json` | Private ESM package; `reqs` bin points to `dist/cli.js`; build, typecheck, and test scripts |
| `pnpm-lock.yaml` | Committed dependency lockfile |
| `tsconfig.json` | Strict NodeNext compilation, ES2022 target, `src` to `dist` |
| `.gitignore` | Ignores dependencies, build output, local history, and environment files; allows `.env.example` |
| `src/core/request.ts` | HTTP methods, recursive JSON values, body union, and request definition |
| `src/cli.ts` | Help output and unknown-command handling; advertises `run` but does not implement it |
| `src/core/load-request.ts` | Reads UTF-8 text and parses JSON, returning `Promise<unknown>` |
| `src/core/validate-request.ts` | Runtime validation using handwritten type guards |
| `src/core/validate-request.test.ts` | Seven declared cases using hardcoded inputs and Node test/assert APIs |

`pnpm test` completed successfully at this checkpoint. The runner output summarized one passing test file. Existing tests exercise validation, not loading, HTTP execution, or end-to-end CLI behavior.

Two small review items before connecting the CLI:

1. The loader export is currently spelled `loadReqestJson`; the intended name is `loadRequestJson`.
2. The validator's type-only import uses `./request.ts`. It currently builds because the type import is erased; use `./request.js` for consistency with the project's Node ESM import convention.

These observations are recorded here without modifying implementation files.

Earlier commits included `node_modules`; a later commit removed it from tracking. The user has pushed this history and explicitly accepts leaving it intact. Do not rewrite history to remove those paths.

## Development commands

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
node dist/cli.js --help
```

`typecheck` runs `tsc --noEmit`. `build` emits JavaScript into ignored local `dist/`. `test` currently builds and runs `node --test dist/core/validate-request.test.js`; expand test discovery when more files are added.

TypeScript checks authored code at compile time. It does not validate JSON read from disk. Runtime tests currently pass independent hardcoded objects into the validator; each call to the test helper creates a fresh object. File-loading tests will be separate.

## Implementation phases

### 1. Foundation — substantially complete

- Request types, package setup, strict compiler configuration, ignore rules.
- Minimal CLI entry point with help and error exit status.
- TypeScript concepts: literal types, recursive types, discriminated unions, optional properties, type-only imports.

### 2. First request — in progress

- Implemented: JSON loading and request validation with focused validator tests.
- Next: review the two checkpoint items and connect `run <file>` to loading and validation.
- Handle missing arguments, unreadable files, invalid JSON, and invalid request definitions at the CLI boundary.
- Then add HTTP execution and response output to complete one request end to end.
- Resolve body file paths relative to the request file.
- Add focused loading, transport, and CLI tests as those behaviors exist; prefer a local test server over external service dependencies.
- During incremental implementation, reject unsupported configured features clearly rather than silently ignoring them.

### 3. Reuse

- Project configuration, named request discovery, `init`, and `list`.
- Environments, variable resolution, and temporary CLI overrides.
- Dry-run output with secrets redacted.

### 4. Authentication

- Named profiles for Basic, bearer, API key, OAuth2, and command-based tokens.
- Local credential cache, expiration handling, refresh locking, and atomic updates.
- Auth status, refresh, and clear commands.

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
  "url": "{{base_url}}/users/{{user_id | path}}",
  "auth": "api",
  "vars": {
    "user_id": "123"
  },
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
- Variables can contain JSON values; headers contain strings; query values are strings or arrays of strings.
- Bodies form a discriminated union:
  - `{ "type": "json", "value": ... }`
  - `{ "type": "text", "value": "..." }`
  - `{ "type": "form", "fields": { "key": "value" } }`
  - `{ "type": "file", "path": "./payload.bin" }`
- Form bodies use URL-encoded fields; multipart is deferred.
- The current validator accepts extra properties. It reconstructs the top-level request from recognized fields.
- URL parsing happens after template resolution; the current validator only requires a nonempty string.
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

`reqs.json` defines project defaults, environments, and named auth profiles. Its exact schema remains to be designed. Keep credential references in configuration and actual token caches in the user's local application state directory, scoped by project, environment, and auth profile. Do not store tokens in committed request files.

## Target CLI

```sh
reqs init
reqs list
reqs run users/get --env dev
reqs run ./requests/users/get.json --env dev
reqs run users/get --var user_id=456
reqs run users/get --var-json limit=10
reqs run users/get --query include=teams
reqs run users/get --header 'X-Debug: true'
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

Overrides affect only the current run. Users can edit JSON directly. Saving variants, an editor command, and automatic historical replay are deferred. Earlier brainstorming included `auth login`; interactive login is not part of the v1 commitment.

## Variables and overrides

Precedence, lowest to highest:

```text
project defaults < request defaults < selected environment < CLI variables
```

- `{{name}}` resolves an ordinary variable.
- `{{env.API_TOKEN}}` explicitly reads an operating-system environment variable.
- Missing variables fail before sending.
- No arbitrary expressions, JavaScript evaluation, or recursive expansion.
- A whole-value placeholder in a JSON body preserves the variable's JSON type.
- Embedded placeholders produce strings; embedding objects or arrays is an error.
- Substitute into parsed JSON values, never raw JSON text.
- Encode query values using URL query encoding.
- Provide explicit path-component encoding, proposed syntax `{{user_id | path}}`.
- `--var name=value` supplies a string; `--var-json name=123` parses a JSON value.
- Direct header and query overrides apply after variable resolution.
- A query override replaces all existing values for its key; repeated flags can provide multiple values.

## Authentication and refresh

| Profile | Intended support |
| --- | --- |
| Basic | Username and password references |
| Bearer | Token reference, initially from an environment variable |
| API key | Credential in a configured header or query parameter |
| OAuth2 | Refresh-token and client-credentials grants |
| Command | Explicit executable and argument list that returns a token |

Example secret reference:

```json
{
  "type": "bearer",
  "token": { "env": "API_TOKEN" }
}
```

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

OAuth2 refresh-token profiles initially accept a refresh token from a configured secret reference. Browser login, PKCE, and device authorization are deferred. Exact profile fields, cache storage details, refresh skew, and replay opt-in syntax remain implementation decisions.

## Output, history, and transport

| Option | Behavior |
| --- | --- |
| Default | Body to stdout; status and timing to stderr |
| `--output <path>` | Write response body bytes to a file |
| `--save-response` | Record body and metadata in local history |
| `--pretty` | Format JSON display without modifying recorded bytes |
| `--dry-run` | Show the resolved request with secrets redacted; do not execute auth commands or refresh |

Recorded metadata includes a run ID, timestamp, request name, environment, redacted resolved method/URL, status, response headers, duration, body filename, and a redacted request configuration snapshot. Store the body separately to support binary data.

Redact authorization and cookie headers and configured API-key locations. Saved response bodies remain as received, so response recording is opt-in.

Transport defaults: finite timeout, TLS verification enabled, redirects disabled unless requested, and no general automatic retries. Choose the HTTP transport after reviewing timeout, redirects, streaming, and auth requirements. No HTTP or CLI framework has been chosen yet.

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
load → validate → resolve variables → apply overrides
     → resolve auth → execute → render / record
```

Use discriminated unions for request bodies and auth profiles, and runtime validation at external-data boundaries. The initial path can send one request at a time; asynchronous Node I/O does not require a concurrent runner.

## Definition of done

V1 is complete when a user can:

- Save a request as JSON and run it by path or name.
- Run it against two environments and override parameters without editing the file.
- Use the agreed auth profiles and obtain or refresh credentials where supported.
- Pipe the response body into another command.
- Optionally write a body file or save and inspect response history.
- Receive predictable errors and exit codes.

Relevant checks must pass, and setup and usage must be documented. Advanced features are not prerequisites for this milestone.

## Longer-term possibilities

- Saved variants (`--save-as`) and an editor command.
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

Read this document and inspect the current files before proposing the next change. Preserve the one-file-at-a-time teaching workflow. Review the loader name and import convention noted above, then connect `src/cli.ts` to request loading and validation for `run <file>`. Explain async error handling at that point; HTTP execution follows afterward.
