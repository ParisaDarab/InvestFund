---
name: llm-integration
description: Backend procedure for implementing AI features through the OpenAI-compatible LLM adapter - configurable base URL/key/model, versioned prompts, structured JSON output validated with Zod, embeddings, document extraction, matching rationale, deck analysis, email drafting, agent tool-calling and MCP. Use for any code that calls an LLM.
---

# LLM integration

## Adapter

```ts
interface LlmProvider {
  complete<T>(req: { task: LlmTask; prompt: PromptTemplate; vars: object; schema: ZodType<T> }): Promise<LlmResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
  runAgent(req: AgentRequest): Promise<AgentResult>; // tool-calling loop
}
```

- The implementation uses the official `openai` npm client with `baseURL`, `apiKey` and `model` loaded from the `llm_settings` table (admin-managed, key decrypted at call time, cached briefly). Settings can be overridden per task (`extraction`, `matching`, `analysis`, `drafting`, `embedding`).
- Prefer structured output (`response_format: json_schema`) and fall back to JSON mode plus Zod parse with one repair retry. Reject the result if parsing still fails.
- Use timeouts (default 60s), exponential-backoff retries on 429 and 5xx, and a circuit breaker. Record tokens and latency per call in `llm_usage`.

## Prompts

- Store prompts in `apps/api/src/integrations/llm/prompts/<task>.v<N>.ts`, exporting `{ id, version, system, user(vars) }`. Never build prompts inline in services.
- Wrap untrusted content (uploaded documents, profiles, emails) in clear delimiters, and instruct the model to treat it as data. Never let the document content choose tools or recipients.

## Agent tools (tool-calling)

- The tools available to the agent are only **read** tools and **draft-creating** tools: `search_matches`, `get_startup_summary`, `get_investor_thesis`, `check_calendar_freebusy`, `create_email_draft` and `create_meeting_proposal`.
- No tool sends email or creates events. Those happen only through approval endpoints after a human clicks approve.
- Every tool validates its arguments with Zod and enforces the calling user's permissions.
- MCP servers are attached through `integrations/mcp` with an allowlist and the same draft-only rule.

## Features

| Feature | Approach |
|---|---|
| Document extraction | Parse PDF/PPTX/DOCX/XLSX to text → chunk → LLM extracts the `StartupFacts` schema with source references → the founder reviews before facts are applied |
| Matching | Hard filters (stage, sector, cheque size, geography, instrument, SEIS/EIS) → embedding similarity → weighted score (admin-adjustable weights) → LLM rationale for the top N |
| Startup analysis | Rubric over 6 areas (team, market, product, traction, business model, fundraising readiness) → scores 0–100, benchmarked by stage, with fixes |
| Deck review | Slide-by-slide feedback, missing-slide check, overall deck score |
| Drafting | Personalised outreach and follow-ups, saved as `EmailDraft` (status `pending_approval`) |

## Testing

Point the base URL at the mock LLM server (`infra/mocks/llm`) in tests. Fixtures are keyed by prompt ID and version.
