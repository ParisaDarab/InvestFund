# mock-llm

Deterministic, fixture-driven, OpenAI-compatible server for tests, CI and the sandbox (P0-MOCK-01).
It never calls a real provider: there is no outbound HTTP code in this package.

|                                  |                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Port                             | `4010` (`localhost:4010` from the host, `http://mock-llm:4010` inside Compose) |
| Base URL for the `openai` client | `http://localhost:4010/v1` (sandbox: `http://mock-llm:4010/v1`)                |
| API key                          | any non-empty bearer value (missing key → 401 `invalid_api_key`)               |
| Run locally                      | `pnpm --filter @investfund/mock-llm dev`                                       |
| Run in Docker                    | `docker compose -f infra/docker-compose.yml up -d mock-llm`                    |

## Endpoints

| Method and path                     | Notes                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/chat/completions`         | Non-streaming. Supports `response_format` (`text`, `json_object`, `json_schema`), `tools` and `tool_choice`. `stream: true` → 400. |
| `POST /v1/embeddings`               | String, string list, token array or list of token arrays. `encoding_format` `float` or `base64` (the `openai` client's default).   |
| `GET /v1/models`                    | `MOCK_CHAT_MODELS`, `mock-embedding` and the `MOCK_EMBEDDING_MODELS` names.                                                        |
| `GET /health`                       | `{ "status": "ok", "fixtures": <count> }`, no auth.                                                                                |
| `GET /__calls`                      | Recorded `/v1/*` calls, in order (see below).                                                                                      |
| `POST /__reset`                     | Clears calls and control rules, releases held requests and reloads fixtures.                                                       |
| `POST /__control`, `GET /__control` | Queue or list failure-injection rules.                                                                                             |

Errors use the OpenAI shape: `{ "error": { "message", "type", "param", "code" } }`.

## Determinism

- Response `id`s and tool-call `id`s are hashes of the request; `created` is fixed at
  `1767225600` (2026-01-01T00:00:00Z). The same request always gives byte-identical output.
- Usage is estimated at 4 characters per token unless the fixture sets it.
- Embeddings are seeded hash vectors: `xoshiro128**` seeded with `sha256(input)`, L2-normalised,
  float32. Same input → same vector, different input → different vector. Dimension precedence:
  the request's `dimensions`, then `MOCK_EMBEDDING_MODELS`, then `MOCK_EMBEDDING_DIM` (1536).

## Fixtures and the prompt-ID convention

Fixtures live in `fixtures/<promptId>/v<version>/<name>.json` and are loaded (and validated) at
start-up and on `POST /__reset`. A malformed file stops the server instead of falling back silently.

```json
{
  "description": "What this fixture is for",
  "vars": { "text": "hello" },
  "response": { "content": "returned verbatim as message.content" },
  "usage": { "promptTokens": 12, "completionTokens": 9 }
}
```

- `response` is one of `{ "content": "…", "finishReason"?: "stop" }`, `{ "json": <any JSON> }`
  (serialised with `JSON.stringify`) or `{ "toolCalls": [{ "name": "…", "arguments": { … } }] }`.
- Omit `vars` to make the fixture the **default** for that prompt version.
- `usage` is optional.

**How a request names its prompt** (to be agreed with the Backend agent before P2, for the
`llm-integration` adapter):

1. Headers (preferred): `x-prompt-id: extraction`, `x-prompt-version: 1` (or `v1`) and optionally
   `x-prompt-vars-hash: <sha256 hex>`. The `openai` client sends them through `defaultHeaders` or
   the per-request `headers` option.
2. Or a marker anywhere in the first `system`/`developer` message:
   `[[prompt:extraction@v1]]` or `[[prompt:extraction@v1#<sha256 hex>]]`.

The **vars hash** is `sha256(canonical JSON of the variables object)`, lowercase hex, where the
canonical JSON is RFC 8785 (JCS): keys sorted, no whitespace. `src/hash.ts` (`varsHash`) is the
reference implementation.

Resolution order: exact `promptId` + `version` + `varsHash` → that version's default fixture →
deterministic fallback:

| Request                                      | Fallback answer                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tool_choice` `required` or a named function | a call to that tool, arguments sampled from its JSON Schema                           |
| `response_format` `json_schema`              | JSON sampled from the schema (valid for the common subset; `pattern` is not honoured) |
| `response_format` `json_object`              | `{}`                                                                                  |
| anything else (incl. `tool_choice` `auto`)   | `Mock completion for <promptId> (<hash>).`                                            |

## Call log (`GET /__calls`)

```json
{
  "calls": [
    {
      "seq": 1,
      "method": "POST",
      "path": "/v1/chat/completions",
      "status": 200,
      "model": "mock-chat",
      "promptId": "test.echo",
      "promptVersion": 1,
      "varsHash": null,
      "fixture": "test.echo/v1/default.json",
      "injected": null,
      "usage": { "prompt_tokens": 3, "completion_tokens": 7, "total_tokens": 10 },
      "inputCount": null
    }
  ]
}
```

Message content is **not** recorded unless `MOCK_RECORD_CONTENT=true` (then `content.request` and
`content.response` are added). `status` is `null` for a request that never got an answer. At most
10 000 records are kept.

## Failure injection (`POST /__control`)

```json
{ "next": 2, "fail": 429, "retryAfter": 1, "path": "/v1/chat/completions" }
```

| Field           | Meaning                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `next`          | Number of matching calls the rule applies to (default 1).                                          |
| `fail`          | `429` (with `retry-after`), `500` or `503` (with `retry-after`).                                   |
| `malformedJson` | `true`: chat content (or tool-call arguments) is invalid JSON; embeddings return a truncated body. |
| `timeout`       | `true`: the request is never answered; the socket is closed after `MOCK_TIMEOUT_HOLD_MS`.          |
| `latencyMs`     | Delay before handling; can be combined with one outcome above, or used alone.                      |
| `path`          | Only calls whose path starts with this prefix consume the rule.                                    |

Rules queue in order (FIFO). `GET /__control` lists what is pending; `POST /__reset` clears it.

## Environment

| Variable                | Default                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `PORT` / `HOST`         | `4010` / `127.0.0.1` (the image uses `0.0.0.0`)                  |
| `MOCK_FIXTURES_DIR`     | `./fixtures`                                                     |
| `MOCK_EMBEDDING_DIM`    | `1536`                                                           |
| `MOCK_EMBEDDING_MODELS` | empty; e.g. `mock-embedding-small=384,mock-embedding-large=3072` |
| `MOCK_CHAT_MODELS`      | `mock-chat`                                                      |
| `MOCK_RECORD_CONTENT`   | `false`                                                          |
| `MOCK_TIMEOUT_HOLD_MS`  | `120000`                                                         |

## Limits (P0)

No streaming, no `n > 1`, no Responses API, no image or audio endpoints. These are added when a
feature needs them.
