# reqs

A TypeScript CLI for reusable HTTP requests stored as JSON.

## Setup

```sh
pnpm install
pnpm build
```

```sh
pnpm reqs --help
```

## Example templates

```sh
cp examples/reqs.example.json reqs.json
mkdir -p requests
cp examples/httpbin.json requests/httpbin.json
```

The tracked files contain placeholders that show the project-config and request
shapes without exposing real secret names. Edit the copied `reqs.json` and
request before running them. The root `reqs.json` and `requests/` directory are
ignored by Git.

The example request targets the public httpbin service. Once configured, JSON
responses are written to stdout with two-space indentation, while other
response bodies are preserved byte-for-byte. Status and timing go to stderr,
which keeps redirection clean:

```sh
pnpm --silent reqs run requests/httpbin.json > response.json
```

Query parameters can be replaced or added for one run without changing the
saved request:

```sh
pnpm reqs run requests/httpbin.json --query example=temporary-value
```

Pass `--query name=value` for each parameter you want to change. If the name
already appears in the request URL or its `query` object, the override replaces
all saved values; otherwise it is added. When the same name is provided more
than once, the last CLI value wins. Values may be empty or contain additional
`=` characters.

For path values, put `{name}` in the saved URL (for example,
`https://example.com/games/{gameId}_stats.xml`), then pass `--path name=value`:

```sh
pnpm reqs run requests/game.json --path gameId=123
```

Placeholders also work as a whole path segment, such as `/games/{gameId}`.
Each placeholder needs a value. Unknown names, empty values, `.` and `..` are
errors. Values are encoded so `/`, `?`, and `#` stay within the path value.
Repeated `--path` options are allowed; the last value for a name wins. Path and
query overrides do not change the saved request file.

## Personal requests

Tracked samples live in `examples/`. The contents of `requests/` are ignored by
Git for local personal requests:

```sh
mkdir -p requests
cp examples/httpbin.json requests/my-request.json
pnpm reqs run requests/my-request.json
```

From the project directory, you can list requests and run them by name. The
name is the path under `requests/` without `.json`; for example,
`requests/nba/hustle_stats.json` is `nba/hustle_stats`:

```sh
pnpm reqs list
pnpm reqs run my-request
pnpm reqs run nba/hustle_stats --path gameId=123
```

Explicit file paths still work, as shown above.

## Request format

```json
{
  "version": 1,
  "method": "GET",
  "url": "https://example.com/users",
  "headers": {
    "Accept": "application/json"
  },
  "query": {
    "include": ["profile", "teams"]
  }
}
```

Required fields are `version`, `method`, and `url`. Optional fields are
`headers`, `query`, and `body`. Bodies support `json`, `text`, `form`, and
`file`; file paths are relative to the request JSON file. GET and HEAD bodies
are rejected.

Named bearer-token and API-key authentication profiles support secrets from
environment variables or `{ "kv": "secret-name" }` references in `reqs.json`.
Key Vault references execute `kv secret-name` directly, without launching a
shell, and use its stdout without persisting the resolved secret. Therefore,
`kv` must be a real executable available on `PATH`; a shell alias or function
alone will not work. The executable must accept one secret name, return a
nonzero status on failure, and write only the secret value to stdout.

You can verify that the executable is available with:

```sh
command -v kv
```

Path and query overrides are supported. Variables and overrides for other
parts of a request are not implemented. See `SPEC.md` for the complete format,
current limitations, and roadmap.

## Development

```sh
pnpm typecheck
pnpm build
pnpm test
```
