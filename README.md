# reqs

A TypeScript CLI for reusable HTTP requests stored as JSON.

## Features

- `reqs init` creates `reqs.json`, `requests/`, and local Git ignore rules without overwriting existing files.
- `reqs list` shows saved requests; `reqs run` accepts a request name or file path.
- `--path name=value` fills URL placeholders such as `{gameId}`; `--query name=value` changes query parameters for one run.
- Requests support headers, repeated query values, JSON/text/form/file bodies, and named bearer or API-key auth profiles backed by environment variables or a `kv` executable.
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

Names are paths under `requests/` without `.json`, so `requests/nba/scores.json` is `nba/scores`. For path overrides, use a saved URL containing `{gameId}` as a whole segment or within one, then run:

```sh
pnpm reqs run nba/hustle_stats --path gameId=123
```

See [SPEC.md](SPEC.md) for the full request and auth formats, limitations, and roadmap.

## Development

```sh
pnpm typecheck
pnpm test
```
