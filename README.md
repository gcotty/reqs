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

## Try it

```sh
pnpm reqs run examples/get-httpbin.json
```

The example makes a live request to the public httpbin service. Response bytes
go to stdout; status and timing go to stderr. This keeps redirection clean:

```sh
pnpm --silent reqs run examples/get-httpbin.json > response.json
```

## Personal requests

Tracked samples live in `examples/`. The contents of `requests/` are ignored by
Git for local personal requests:

```sh
mkdir -p requests
cp examples/get-httpbin.json requests/my-request.json
pnpm reqs run requests/my-request.json
```

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

Variables and authentication are not implemented yet. See `SPEC.md` for the
complete format, current limitations, and roadmap.

## Development

```sh
pnpm typecheck
pnpm build
pnpm test
```
