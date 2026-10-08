---
name: api-client-integration
description: Frontend procedure for calling the InvestFund REST API - typed fetch client, auth token refresh, shared Zod parsing, TanStack Query keys/mutations, problem+json error handling and optimistic updates. Use whenever UI reads or writes server data.
---

# API client integration

## Client (`apps/web/src/lib/api/client.ts`)

- `apiFetch<T>(path, { method, body, schema })`:
  - prefixes `NEXT_PUBLIC_API_URL + /api/v1`
  - attaches `Authorization: Bearer <accessToken>` (held in memory)
  - on 401, calls `POST /auth/refresh` once (httpOnly cookie), then retries
  - parses success bodies with the shared Zod `schema`
  - converts problem+json into a typed `ApiError { status, title, detail, fieldErrors }`
- Send an `Idempotency-Key` (`crypto.randomUUID()`) on side-effecting POSTs.

## Queries

- Use a query-key factory per domain, for example `startupKeys.detail(id)`.
- Create one hook per endpoint in `lib/api/<domain>.ts`, such as `useStartup(id)` and `useUpdateStartup()`.
- Mutations invalidate the affected keys. Use optimistic updates only for low-risk toggles (such as saving an interest), **never** for approve/send.

## Errors in the UI

Map `fieldErrors` to form fields. Show a toast for other 4xx errors and an error boundary with retry for 5xx. Show a 403 as a "no access" view, not a crash.

## Never

- call the API from Server Components with a user token stored client-side; use server actions or route handlers with the forwarded cookie
- store tokens in `localStorage`
- trust client-side role checks alone; the API is authoritative
