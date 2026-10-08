---
name: phase-planning
description: Supervisor procedure for creating and maintaining the phased delivery plan (docs/PHASE_PLAN.md) with milestones, dependencies, risks and gate checklists. Use at project start, at each phase boundary, or when scope changes.
---

# Phase planning

## Output: `docs/PHASE_PLAN.md`

For each phase:

```markdown
## Phase N: <name>
Goal: <user-visible outcome>
Requirements covered: FR-..., NFR-...
Deliverables:
- ...
Task cards: docs/tasks/pN/
Exit criteria (Gate D):
- [ ] All cards Done (CLAUDE.md §10)
- [ ] Phase test report PASS (docs/test-reports/phase-N.md)
- [ ] Demo script runs in sandbox
- [ ] Docs/OpenAPI updated
Risks: <risk → mitigation>
Branch: feature/pN-<slug>
```

## Rules

- Phase 0 is always foundations: monorepo, tooling, CI, Docker infra, mock servers, auth skeleton, design tokens.
- Each phase ends with something **demoable** in the sandbox.
- Put the highest-risk items early: the matching engine quality, Google OAuth verification, LLM structured output.
- Re-plan only through Gate A. Record scope changes in `docs/DECISIONS_LOG.md`.
- Keep a visible "Deferred / later phases" list so nothing is silently dropped.
