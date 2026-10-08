# P0-MOCK-01: Mock LLM server skeleton (OpenAI-compatible)
Owner: tester        Estimate: M
Requirements: NFR-AI-01, NFR-REL-01 (testable without paid APIs)
Depends on: P0-REPO-01, P0-INFRA-01

## Goal
A deterministic OpenAI-compatible server so that every AI feature can be developed and tested in CI and the sandbox with no real API key, no cost and no network egress, including failure modes.

## Scope
- In: `infra/mocks/llm` (Express + TypeScript): `POST /v1/chat/completions` (supports `response_format` `json_schema` and `json_object`, and `tools`; non-streaming in P0), `POST /v1/embeddings` (deterministic seeded hash vectors, dimension from the request's model mapping or `MOCK_EMBEDDING_DIM`, default 1536, L2-normalised), `GET /v1/models`, `GET /health`; fixture loader from `infra/mocks/llm/fixtures/<promptId>/v<version>/*.json`, keyed by prompt ID and version (read from a `x-prompt-id`/`x-prompt-version` header or a metadata marker in the system message) plus a hash of the variables, with a deterministic fallback response that is valid for the requested JSON schema where possible; `GET /__calls` (records method, path, model, prompt ID, token counts; never full content unless `MOCK_RECORD_CONTENT=true`), `POST /__reset`, `POST /__control` (inject latency, 429, 500, malformed JSON, timeout for the next N calls); usage numbers in responses; Dockerfile; README with fixture conventions.
- Out: fixtures for specific features (added in each phase); streaming (added when a feature needs it).

## Contracts / inputs
- Endpoints: OpenAI Chat Completions and Embeddings request/response shapes (the subset used by the `openai` npm client)
- Schemas: internal to the mock
- Tables: none

## Acceptance criteria
1. Given the official `openai` npm client pointed at the mock, When `chat.completions.create` is called, Then it returns a well-formed response including `usage`.
2. Given the same embedding input twice, When `/v1/embeddings` is called, Then the vectors are identical, have the configured dimension and unit length; different inputs give different vectors.
3. Given a fixture for prompt `test.echo` v1, When a request carries that prompt ID and matching variables, Then the fixture content is returned verbatim.
4. Given `POST /__control { "next": 2, "fail": 429 }`, When three calls are made, Then the first two return 429 with `retry-after` and the third succeeds.
5. Given `POST /__control { "next": 1, "malformedJson": true }`, When a `json_schema` request is made, Then the content is invalid JSON.
6. Given several calls, When `GET /__calls` is called, Then each call is listed in order; after `POST /__reset` the list is empty.

## Test requirements
- Unit: fixture key resolution, embedding determinism and normalisation, control-state transitions.
- Integration: Supertest plus a test using the real `openai` client against the running mock.
- E2E / non-functional: health and one completion are included in the P0 sandbox smoke (P0-TEST-02).

## Notes / risks
- The mock must never forward requests to a real provider.
- The prompt-ID convention must be agreed with the Backend agent before P2 (record it in the mock README and in the `llm-integration` usage).
