# ADR-0005: In-process realtime with a documented scale-out path

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** None

## Context

Teams expect board, comment, and notification updates without refreshing. The
application also needs a clear path to multiple API replicas without rewriting
route handlers. Realtime events are advisory: clients still fetch authorized
state through REST.

## Decision

- Use Socket.IO in-process, authenticated with the existing HttpOnly access
  cookie or handshake token.
- On connection, join `user:{id}` and one `org:{organizationId}` room per membership.
- Emit domain events after successful mutations from isolated emitter helpers.
- Notifications are persisted first, then pushed to the user room.
- Clients invalidate React Query caches and show toasts; they refetch through
  authenticated endpoints.
- Keep the emitter behind `realtime.ts` so a Redis adapter can be added without
  route changes (issue #24).

## Consequences

### Positive

- Fast local development with no extra infrastructure.
- No unauthorized project data in socket events; room membership is derived from
  verified memberships.
- UI state remains consistent because REST refetch is the source of truth.

### Negative / trade-offs

- Single-process fan-out only; multiple replicas do not share rooms.
- No delivery guarantee; offline clients catch up via REST.
- No per-event authorization beyond room membership.

### Follow-ups

- Add Redis pub/sub adapter and shared rate limiting (issue #24).
- Add event payload contract tests and reconnect/resync coverage.
- Consider an outbox for durable notification delivery (email issue #22).

## Alternatives considered

| Alternative | Why not chosen |
| --- | --- |
| Polling | Higher latency/load and worse UX for board collaboration. |
| Server-Sent Events | Simpler but lacks bidirectional presence/rooms and Socket.IO semantics. |
| Managed realtime service | Adds a paid external dependency not justified for the baseline. |

## Verification

`apps/api/tests/realtime.test.ts` covers unauthorized socket rejection, task
broadcast, and assignee notifications. Manual two-session verification confirmed
UI invalidation and toast delivery.
