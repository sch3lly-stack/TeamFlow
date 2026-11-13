# ADR-0001: Monorepo and runtime boundaries

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** None

## Context

The product requires a React SPA, an Express API, a shared PostgreSQL database,
Socket.IO, and independent deployment concerns. Development speed, traceability,
and a single CI pipeline matter for this portfolio-scale application, but API
and web must remain independently buildable and deployable.

## Decision

Use an npm-workspaces monorepo:

- `apps/api` owns HTTP, authentication, authorization, Prisma access, uploads,
  Socket.IO, and background side effects.
- `apps/web` owns the browser application and talks only to the API.
- No cross-workspace runtime import. Shared contracts are represented by API
  schemas and mirrored TypeScript UI types; the backend remains authoritative.
- Each app has its own Dockerfile; Nginx serves the SPA and proxies `/api` and
  `/socket.io` to the API.

## Consequences

### Positive

- One checkout, lockfile, CI pipeline, and review history.
- API and web can still be built and deployed independently.
- Clear security boundary: the browser never imports server code or database types.

### Negative / trade-offs

- UI types and the capability matrix are mirrored, so drift is possible.
- A single CI run builds both applications, increasing feedback time.
- Workspace-level tooling must be kept aligned (Node, TypeScript, npm).

### Follow-ups

- Add contract tests or generated OpenAPI types if contract drift becomes a risk.
- Consider a shared types package only if build complexity can be kept low.

## Alternatives considered

| Alternative | Why not chosen |
| --- | --- |
| Polyrepo | Slower cross-cutting changes and duplicated CI for this scope. |
| Server-rendered monolith | Reduces API/realtime flexibility and SPA interactivity. |
| Shared runtime package | Adds build/version coupling; not justified for current contracts. |

## Verification

CI builds both workspaces from one lockfile. Docker jobs build independent API
and web images. The web app is verified by Playwright against the API.
