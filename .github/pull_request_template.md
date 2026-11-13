## Linked issue

Closes #

## Why

<!-- Problem, risk, or opportunity. Explain why this change is needed now. -->

## What changed

<!-- Focused summary of implementation. Call out completed acceptance criteria. -->

## Affected components

- [ ] API (`apps/api`)
- [ ] Web (`apps/web`)
- [ ] Database / migration (`apps/api/prisma`)
- [ ] Realtime / Socket.IO
- [ ] Infrastructure / CI
- [ ] Documentation

## Testing

<!-- Record exact commands and results. Do not hide failures. -->

- [ ] `npm run typecheck`
- [ ] `npm test` — result:
- [ ] `npm run test:e2e` (UI changes) — result:
- [ ] `npm run build`
- [ ] `npx prisma validate` (schema changes)
- [ ] `npm audit --omit=dev`
- [ ] Manual verification / screenshots:

## Database and migration notes

<!-- Schema changes, forward-fix/rollback plan, seed impact. Write "None" if not applicable. -->

## Screenshots

<!-- Before/after for significant UI changes. Redact secrets and private data. -->

## Risks and rollback

<!-- Security, tenant isolation, performance, compatibility, operational risk and rollback path. -->

## Engineering self-review

<!-- Required when no independent reviewer is available. State explicitly that this is a self-review, not independent approval. -->

- [ ] Complete diff reviewed line by line.
- [ ] Acceptance criteria verified.
- [ ] No unrelated changes or scope creep.
- [ ] Authorization, tenant isolation, validation and secrets reviewed.
- [ ] Duplication/complexity checked.
- [ ] Documentation/changelog/ADR updated as needed.
- [ ] Required CI checks are green.
