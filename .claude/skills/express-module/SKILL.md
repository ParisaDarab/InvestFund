---
name: express-module
description: Backend procedure for implementing a new domain module or endpoint in apps/api using the layered Express + TypeScript architecture (routes, controller, service, repository), dependency injection, validation, RBAC and problem+json errors. Use for any new REST endpoint or domain module.
---

# Express domain module

## Steps

1. Confirm that the contract exists in `docs/API.md` and that the schemas exist in `packages/shared/src/api/<domain>.ts`. If they don't, stop and ask the supervisor.
2. Create `apps/api/src/modules/<domain>/` containing `routes`, `controller`, `service`, `repository`, `types` and `__tests__/`.
3. Build the module's router in the composition root (`core/container.ts`) and add it to the `modules` list as `ApiModule { path, router }`. `app.ts` mounts every module under `/api/v1`; do not edit `app.ts` per module.
4. Write the tests first or alongside the code: service unit tests and a route integration test.

## Skeleton

```ts
// <domain>.routes.ts
export function buildStartupRoutes(c: StartupController, auth: AuthGuards): Router {
  const r = Router();
  r.post('/', auth.requireRole('founder'), validate({ body: CreateStartupRequest }), c.create);
  r.get('/:startupId', auth.requireAuth(), c.getById); // visibility resolved in service
  return r;
}

// <domain>.controller.ts: thin
export class StartupController {
  constructor(private readonly service: StartupService) {}
  create = asyncHandler(async (req, res) => {
    const result = await this.service.create(req.user, req.body);
    res.status(201).location(`/api/v1/startups/${result.id}`).json(StartupResource.parse(result));
  });
}

// <domain>.service.ts: business rules, depends on interfaces
export class StartupService {
  constructor(private readonly repo: StartupRepository, private readonly events: DomainEvents) {}
}

// <domain>.repository.ts: Prisma only
export class PrismaStartupRepository implements StartupRepository { /* ... */ }
```

## Rules

- Throw typed domain errors (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`). The central handler maps them to problem+json.
- Ownership and visibility checks live in the **service**, not in the router.
- Wrap multi-write operations in `prisma.$transaction` (Unit of Work).
- Side-effecting operations take an `ApprovalRecord` ID and verify it (status `approved`, actor matches, payload hash matches).
- Rate-limit with the `core/rateLimit` presets: `auth`, `ai`, `upload` and `default`.
- Add the OpenAPI registration through the shared schemas generator.
