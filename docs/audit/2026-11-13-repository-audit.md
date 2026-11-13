# Repository audit — 2026-11-13

## Purpose

Reconstruct an accurate GitHub work history for a completed application that was
built before repository tracking existed, then establish the workflow for all
future work. This report records what exists, what was verified, what remains
incomplete, and what is blocked.

## Method

1. Inspected the working tree: API, web, Prisma schema/migration/seed, tests,
   Docker/Compose, CI, documentation, screenshots, and roadmap.
2. Ran the validation suite locally against PostgreSQL 16:
   - `npm test -w @teamflow/api` — 22/22 tests passing.
   - `npm run test:e2e -w @teamflow/web` — 4/4 tests passing.
   - `npm run typecheck` — both workspaces passed.
   - `npm run build` — API and web production builds passed.
   - `npx prisma validate` — schema valid.
   - `npm audit --omit=dev` — 0 vulnerabilities.
3. Created the GitHub repository and pushed the bootstrap commit `64c3baf` to
   `main`.
4. Confirmed the bootstrap CI run
   [43518750719](https://github.com/sch3lly-stack/TeamFlow/actions/runs/43518750719)
   passed all jobs: `Typecheck, test, build`; `End-to-end tests`; `Docker images`.
5. Created labels, five milestones, and retroactive issues. Closed completed
   issues only after recording verification evidence.
6. Implemented and merged the governance documentation in PR
   [#35](https://github.com/sch3lly-stack/TeamFlow/pull/35), whose CI run
   [43521093073](https://github.com/sch3lly-stack/TeamFlow/actions/runs/43521093073)
   passed all jobs.
7. Configured `main` branch protection with the three real CI check contexts and
   verified the configuration through the GitHub API.

## Important disclosure

- The repository had no Git history, remote, `AGENTS.md`, issues, PRs, or project
  board before this audit.
- The initial baseline was delivered as a direct bootstrap commit because there
  was no history to branch from. This is the single documented direct-to-main
  exception.
- Retroactive issues were created on **2026-11-13** and state that fact. There
  were no historical PRs, reviews, or creation dates.
- No independent human review occurred. Engineering self-review is labeled as
  self-review.
- The Project V2 board could not be created because the authenticated token lacks
  `project`/`read:project` scopes. No board is claimed to exist.

## Completed work — verified and closed

| Issue | Outcome | Primary evidence |
| --- | --- | --- |
| [#1](https://github.com/sch3lly-stack/TeamFlow/issues/1) | Monorepo/runtime foundation | Workspace builds, Prisma generation, CI build job |
| [#2](https://github.com/sch3lly-stack/TeamFlow/issues/2) | Secure auth and CSRF | `apps/api/tests/auth.test.ts`, Playwright auth flows |
| [#3](https://github.com/sch3lly-stack/TeamFlow/issues/3) | Tenant isolation and RBAC | `isolation.test.ts`, `permissions.test.ts` |
| [#4](https://github.com/sch3lly-stack/TeamFlow/issues/4) | Organizations, members, invitations, teams | Role/invitation tests, settings and invite UI |
| [#5](https://github.com/sch3lly-stack/TeamFlow/issues/5) | Projects and configurable workflow | Project/task tests, project UI |
| [#6](https://github.com/sch3lly-stack/TeamFlow/issues/6) | Tasks, comments, dependencies, attachments | `tasks.test.ts`, `db.test.ts`, task drawer |
| [#7](https://github.com/sch3lly-stack/TeamFlow/issues/7) | Kanban board | Board implementation, move tests, browser review |
| [#8](https://github.com/sch3lly-stack/TeamFlow/issues/8) | Sprints and reports | Sprint lifecycle tests, SprintPanel |
| [#9](https://github.com/sch3lly-stack/TeamFlow/issues/9) | Realtime collaboration | `realtime.test.ts`, two-session verification |
| [#10](https://github.com/sch3lly-stack/TeamFlow/issues/10) | Analytics, workload, reports | API smoke checks, report tests, UI review |
| [#11](https://github.com/sch3lly-stack/TeamFlow/issues/11) | Calendar and search | Search isolation test, manual calendar review |
| [#12](https://github.com/sch3lly-stack/TeamFlow/issues/12) | Playwright E2E | 4/4 browser tests |
| [#13](https://github.com/sch3lly-stack/TeamFlow/issues/13) | CI, Docker, Compose | GitHub Actions run `43518750719` |
| [#14](https://github.com/sch3lly-stack/TeamFlow/issues/14) | Documentation, screenshots, seed | Seed run, docs review |
| [#15](https://github.com/sch3lly-stack/TeamFlow/issues/15) | API integration suites | 22/22 tests |
| [#16](https://github.com/sch3lly-stack/TeamFlow/issues/16) | Permanent engineering rules | PR #35, CI run `43521093073` |
| [#19](https://github.com/sch3lly-stack/TeamFlow/issues/19) | Branch protection | Verified protection API: required checks, no force push/deletion |

## Partial or missing work — open backlog

| Issue | Classification | Remaining work |
| --- | --- | --- |
| [#17](https://github.com/sch3lly-stack/TeamFlow/issues/17) | In progress | This PR: changelog, ADRs, root security policy, audit report |
| [#18](https://github.com/sch3lly-stack/TeamFlow/issues/18) | Blocked | Project V2 board; requires missing GitHub token scopes |
| [#20](https://github.com/sch3lly-stack/TeamFlow/issues/20) | Partial | Dashboard layout is localStorage-only; persist per user/org |
| [#21](https://github.com/sch3lly-stack/TeamFlow/issues/21) | Partial | Calendar API exists; ICS/external sync remains |
| [#22](https://github.com/sch3lly-stack/TeamFlow/issues/22) | Missing | Invitation/notification email delivery |
| [#23](https://github.com/sch3lly-stack/TeamFlow/issues/23) | Partial | Local uploads; object storage and malware scanning remain |
| [#24](https://github.com/sch3lly-stack/TeamFlow/issues/24) | Missing | Redis adapter and distributed rate limiting |
| [#25](https://github.com/sch3lly-stack/TeamFlow/issues/25) | Partial | Search uses ILIKE; trigram/ranked search remains |
| [#26](https://github.com/sch3lly-stack/TeamFlow/issues/26) | Missing | Automated accessibility audit |
| [#27](https://github.com/sch3lly-stack/TeamFlow/issues/27) | Missing | Tracing, metrics, alerting |
| [#28](https://github.com/sch3lly-stack/TeamFlow/issues/28) | Missing | Enterprise SSO/SCIM |
| [#29](https://github.com/sch3lly-stack/TeamFlow/issues/29) | Missing | GitHub PR/commit integration |
| [#30](https://github.com/sch3lly-stack/TeamFlow/issues/30) | Gap | Calendar/search/report/org route integration coverage |
| [#31](https://github.com/sch3lly-stack/TeamFlow/issues/31) | Scale gap | SQL/materialized analytics |
| [#32](https://github.com/sch3lly-stack/TeamFlow/issues/32) | Missing | Restore archived projects |
| [#33](https://github.com/sch3lly-stack/TeamFlow/issues/33) | Scale gap | Cursor pagination |
| [#34](https://github.com/sch3lly-stack/TeamFlow/issues/34) | Missing | Automated dependency/security updates |

## Milestones

- v0.1 — Core Platform: closed after verified issues #1–#4.
- v0.2 — Project Delivery: closed after verified issues #5–#8.
- v0.3 — Collaboration & Insights: closed after verified issues #9–#11.
- v0.4 — Security, Quality & Documentation: closed after verified issues #12–#15.
- v1.0 — Engineering Workflow & Release Readiness: open; tracks governance,
  hardening, scale, and future integrations.

## Known limitations

1. **Project V2 board is blocked** by missing `project`/`read:project` scopes.
   Issues + milestones remain the active tracking fallback. The failure was
   reproduced with `gh project create`.
2. **Docker was not available locally**; image builds are verified by the
   `Docker images` CI job on GitHub Actions, which passed.
3. **No independent reviewer** exists. Required approvals are 0; self-review is
   documented and not misrepresented as independent approval.
4. **CI validates the current baseline**, not every historical state.
5. **Calendar/search/report route coverage** is narrower than task/auth/isolation
   coverage; tracked in #30.

## Next logical work

1. Merge #17 (this documentation package) after CI.
2. Release `v1.0.0` from green `main` with the changelog entry.
3. Resolve Project V2 scopes (#18) with account-owner authorization.
4. Close integration-test gaps (#30).
5. Deliver email delivery (#22) and object-storage hardening (#23) before calling
   the application production-ready.
