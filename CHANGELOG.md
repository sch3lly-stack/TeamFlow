# Changelog

All notable changes to TeamFlow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Release entries are
written only from a green `main`; retroactive entries identify the verified
baseline commit because no historical release record existed.

## [Unreleased]

### Added

- Permanent engineering workflow in `AGENTS.md`, contributor guide, issue/PR
  templates, and CODEOWNERS. (#16)
- Changelog, root security policy, Architecture Decision Records, and the
  repository audit report. (#17)

### Changed

- Web dev server and production builds use Vite 6.4.5 (from 5.4.21). Vite 6 is
  declared at the workspace root so `@vitejs/plugin-react` and
  `apps/web/vite.config.ts` share one Vite 6 install. (#40)
- API tests run on Vitest 4.1.12 (from 2.1.9) and use that same Vite 6 install.
  4.1.12 is the first 4.1 release that includes the `@vitest/mocker` fixes for
  GHSA-qxg6-89mg-rqv8 and GHSA-xp26-3454-mjgp; 4.1.11 is in the affected range.
  The Vite 5 copy required by Vitest 2 is no longer installed. (#39)
- `main` is protected by required pull requests, strict up-to-date checks, and
  the `Typecheck, test, build`, `End-to-end tests`, and `Docker images` CI jobs. (#19)
- Issue and milestone tracking replaces the pre-tracking ad-hoc workflow.
- Project V2 board remains blocked by missing GitHub token scopes; issues and
  milestones are the active fallback. (#18)

### Security

- Production dependency audit reports zero vulnerabilities at the time of the
  engineering-workflow release.

## [1.0.0] — 2026-11-13

Initial verified baseline at commit `64c3baf`. This entry is retroactive: the
implementation was completed before GitHub tracking existed.

### Added

- Multi-tenant organizations, departments, teams, memberships, invitations, and
  role management with owner safeguards.
- Secure authentication: scrypt passwords, short-lived JWT access cookies,
  hashed rotating refresh tokens, CSRF protection, rate limits, and audit logs.
- Organization-scoped projects, configurable workflow columns, project roles,
  milestones, and soft archive.
- Tasks with per-project keys, assignments, priorities, categories, estimates,
  dependencies with cycle prevention, comments, private attachments, and
  activity history.
- Drag-and-drop Kanban board with filters, WIP limits, and realtime updates.
- Sprint planning, one-active-sprint enforcement, burndown, reports, completion
  metrics, and incomplete-work carry-over.
- Organization dashboard, delivery analytics, workload planning, CSV/JSON project
  reports, calendar events, and organization search.
- Socket.IO collaboration with authenticated rooms, notifications, and UI toasts.
- React design system with responsive layouts, light/dark themes, and accessible
  form controls.
- PostgreSQL schema, initial migration, two-organization demo seed, and stored
  demo attachment.
- Dockerfiles, Compose stack, Nginx configuration, and GitHub Actions quality,
  E2E, and Docker jobs.
- Architecture, database ERD, API reference, security documentation, roadmap,
  screenshots, and MIT license.
- API integration suite (22 tests) and Playwright E2E suite (4 tests).

### Security

- Cross-tenant access attempts return `404`; isolation and RBAC are covered by
  automated tests.
- Production dependency audit completed with zero known vulnerabilities.

### Notes

- Invitation email delivery is not implemented; secure links are generated for
  manual delivery. Tracked in issue #22.
- Dashboard widget preferences are client-side only. Tracked in issue #20.
- Attachments use local disk; object storage and malware scanning are future
  work. Tracked in issue #23.
