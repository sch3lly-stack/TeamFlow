# Roadmap

## Delivered

- [x] **Phase 1 — Foundation** monorepo, TypeScript, Vite/React/Tailwind, Express, Prisma/PostgreSQL, Docker/Compose, CI skeleton.
- [x] **Phase 2 — Auth & organizations** register/login/logout/refresh, scrypt, rotating sessions, CSRF, rate limits, organizations, memberships, invitations, settings, audit log.
- [x] **Phase 3 — Teams & membership** departments, teams, team members, role management, guardrails for last owner and owner accounts.
- [x] **Phase 4 — Projects & tasks** project lifecycle, owners, goal/deadline metadata, project roles, configurable columns, task numbering, assignment, categories, dependencies, comments, attachments, activity.
- [x] **Phase 5 — Kanban** drag-and-drop board, WIP limits, filters, completion semantics, live invalidation.
- [x] **Phase 6 — Sprints** planning, one active sprint, start/complete, add/remove tasks, burndown, completion metrics, reports, carry-over.
- [x] **Phase 7 — Real-time** authenticated Socket.IO, organization/user rooms, task/comment/activity events, notification toasts.
- [x] **Phase 8 — Analytics & reporting** dashboard, project insights, workload, throughput, cycle time, on-time rate, velocity, CSV/JSON project reports, calendar.
- [x] **Phase 9 — Security & documentation** isolation/RBAC/auth/workflow/realtime tests, Playwright flows, architecture/ERD/API/security docs, screenshots, demo seed.
- [x] **Phase 10 — Delivery** production Dockerfiles, Nginx proxy, Compose volumes/healthchecks, GitHub Actions quality/e2e/docker jobs, MIT license.
- [x] **Phase 11 — Engineering governance** permanent `AGENTS.md` rules, contributor guide, issue/PR templates, CODEOWNERS, CHANGELOG, root security policy, ADRs, retroactive audit, protected `main`, and milestone-based tracking. (#16, #17, #19)

## Next

### Near term

- [ ] Add ESLint/Prettier CI formatting gate and Dependabot.
- [ ] Add request-level authorization snapshot tests for every route.
- [ ] Improve search with `pg_trgm` GIN indexes and ranking.
- [ ] Add saved filters/views per project.
- [ ] Add notification preferences and email digest delivery.
- [ ] Add mention parsing in comments (`@name`) with targeted notifications.

### Scale and production hardening

- [ ] Redis-backed rate limiting and Socket.IO adapter for multiple API replicas.
- [ ] S3-compatible uploads, signed URLs, malware scanning, retention policies.
- [ ] SQL/materialized-view analytics jobs for large organizations.
- [ ] Cursor pagination for activity/audit/notifications.
- [ ] OpenTelemetry traces, metrics, and alerting.
- [ ] Background worker for reminders (milestone due, sprint ending) using an outbox table.

### Product expansion

- [ ] External calendar sync (Google Calendar / Microsoft Graph) with ICS subscription feeds.
- [ ] GitHub integration: link PRs/commits to task keys, branch naming assistance, status automation.
- [ ] Custom fields and saved dashboards persisted server-side.
- [ ] Sprint scope-change tracking and cumulative flow diagrams.
- [ ] Organization-level SCIM provisioning and SSO (OIDC/SAML).
- [ ] Granular custom roles with an editable capability matrix.

### Quality

- [ ] Raise integration coverage across every route module.
- [ ] Add load tests for board, sprint report, and analytics endpoints.
- [ ] Add accessibility audit (axe) to Playwright.
- [ ] Add contract tests for Socket.IO event payloads.
