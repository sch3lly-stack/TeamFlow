# ADR-0002: Tenant isolation and capability authorization

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** None

## Context

TeamFlow stores confidential project, task, comment, attachment, analytics, and
audit data for multiple organizations in one database. A single cross-tenant
read or write is a release-blocking defect. Authorization also needs to express
organization roles and project-scoped roles without scattering ad-hoc checks.

## Decision

1. **Organization is the tenant boundary.** Tenant-owned tables carry
   `organizationId`. Child rows resolve the organization through their parent.
2. **Membership is the access gate.** Every organization-scoped request resolves
   `(userId, organizationId)` from `Membership`. If it does not exist, the
   resource returns `404`, not `403`, to avoid existence disclosure.
3. **Resource access resolves from the resource, not the client.** Task/project
   lookups load the stored record and derive the organization from it; client
   tenant IDs are never trusted.
4. **Capabilities are centralized.** `domain/permissions.ts` defines the
   organization capability matrix. Project roles extend it; a project-level
   `VIEWER` is a hard restriction.
5. **Backend enforcement only.** The web capability mirror hides controls but is
   never the authorization boundary.
6. **Tests are adversarial.** Isolation and RBAC suites attempt cross-tenant
   reads/writes, search leakage, workload leakage, notification leakage,
   comments, dependencies, and privilege escalation.

## Consequences

### Positive

- A consistent, testable authorization model with explicit denial semantics.
- A project manager can manage their project without becoming an organization admin.
- Cross-tenant identifiers do not reveal existence.

### Negative / trade-offs

- Service-layer discipline is required; a forgotten membership query is dangerous.
- `organizationId` denormalization adds write-time validation and storage cost.
- Project role intersection/narrowing semantics must be understood by reviewers.

### Follow-ups

- Add route-level authorization coverage for every endpoint (issue #30).
- Consider PostgreSQL row-level security as defense in depth, but do not replace
  service authorization.

## Alternatives considered

| Alternative | Why not chosen |
| --- | --- |
| PostgreSQL RLS only | Easy to bypass with migration/admin paths; weaker developer feedback and harder capability composition. |
| Schema/database per tenant | Operationally heavy for this scope and complicates migrations. |
| UI-only role checks | Trivially bypassable; rejected as insecure. |

## Verification

`apps/api/tests/isolation.test.ts` and `permissions.test.ts` exercise the model
against real PostgreSQL. The audit record maps those tests to completed issues.
