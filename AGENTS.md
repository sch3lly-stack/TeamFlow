# TeamFlow Engineering Rules

**Status:** Permanent repository instruction — version controlled, required reading, and authoritative for all future work.

This file applies to every human contributor, AI coding agent, reviewer, and repository maintainer. Read it at the start of every development session. If an agent-specific instruction file is added later, it must remain consistent with this file; when instructions conflict, the stricter security and review rule applies.

This file must not be deleted, replaced, ignored, or excluded from version control without explicit authorization from the repository owner.

## Operating routine (read before every session)

Before doing any development work:

1. Read this file and inspect the GitHub repository — open issues, open PRs, CI status, milestones, and blocked work.
2. Treat GitHub Issues as the authoritative source of project work.
3. Never begin a meaningful feature, bug fix, refactor, security change, infrastructure change, or improvement without an associated GitHub Issue.
4. Deliver through a short-lived branch and pull request. Perform a complete engineering self-review, run the relevant tests and required CI checks, correct discovered issues, and merge only when repository requirements are satisfied.
5. Update the associated issue, milestone, and Project tracking. Verify the issue closed and the branch was deleted.
6. Maintain this workflow across every session. Do not rely on conversation history to remember project status.
7. Never falsely report completed work, hide failed checks, or bypass repository security protections.

This routine is a concise entry point. The detailed rules below remain mandatory.

## 1. Source of truth

GitHub is the authoritative project-management system for this repository:

- Every meaningful feature, bug, refactor, security change, infrastructure change, test addition, or documentation change has a GitHub Issue.
- Work moves through a short-lived branch, a pull request, review, required CI checks, and a squash merge.
- Completed work is represented by a closed issue linked to a merged PR.
- Milestones represent releases and development phases. The Project V2 board is the intended delivery view; it is currently blocked by missing GitHub token scopes (see issue #18).
- Chat instructions do not replace written issues, PR descriptions, changelogs, or ADRs.

Do not claim that an issue, branch, pull request, check, merge, milestone, or project board exists unless the GitHub operation actually succeeded and the result was verified.

### Intended Project board lifecycle

Project V2 creation is blocked by missing token scopes (issue #18); issues and milestones are the active fallback. When the board becomes available, use these columns and exit criteria:

| Column | Exit criterion |
| --- | --- |
| Backlog | Candidate work, not yet defined |
| Approved / Ready | Issue has scope, acceptance criteria, dependencies, priority and milestone |
| In Progress | Branch exists and implementation is active |
| In Review | PR is open with self-review and green or actively checked CI |
| Testing | Validation, migration rehearsal, or browser/realtime verification in progress |
| Done | PR squash-merged, branch deleted, issue closed, tracking updated |

Work should not skip from Backlog to In Progress without a Ready issue. "Done" is reserved for verified merges, not opened PRs.

### Cross-repository consistency

The same issue → branch → PR → CI → merge discipline should be applied to other repositories maintained by the owner. Each repository requires its own `AGENTS.md`, labels, milestones, protection rules, and explicit authorization. This file governs TeamFlow only; do not claim another repository is compliant until it has been audited and configured.

## 2. Repository map and standard commands

| Area | Path |
| --- | --- |
| API | `apps/api` — Express, Prisma, Socket.IO, Vitest/Supertest |
| Web | `apps/web` — React, Vite, Tailwind, React Query, Playwright |
| Database | `apps/api/prisma` — schema, migrations, seed |
| Tests | `apps/api/tests`, `apps/web/e2e` |
| Infrastructure | `Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`, `nginx.conf` |
| CI | `.github/workflows/ci.yml` |
| Documentation | `README.md`, `docs/`, `ROADMAP.md`, `CHANGELOG.md`, `docs/adr/` |

Standard validation:

```bash
npm run typecheck                 # both workspaces
npm test                          # API integration suite (real PostgreSQL)
npm run test:e2e                  # Playwright, requires seeded DB
npm run build                     # API + web production builds
npm audit --omit=dev              # production dependency audit
npx prisma validate --schema apps/api/prisma/schema.prisma
```

Database workflow:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:deploy                 # deployment/CI
```

## 3. Required session-start checklist

Before changing anything:

1. Read this file.
2. Run `git status` and confirm the working tree state.
3. Read open issues, open PRs, and milestone status with `gh`.
4. Review failing or pending CI runs.
5. Identify blocked work and its exact blocker.
6. Select the next task by dependency, priority, and milestone.
7. Confirm the issue exists and is specific enough; update it if not.
8. Create or switch to a correctly named branch from an up-to-date `main`.

## 4. Issue requirements

Every issue must contain:

- A clear title using a conventional prefix where practical (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `perf:`, `refactor:`, `security:`).
- Objective or problem statement.
- Background and technical context.
- Scope and explicit out-of-scope items when useful.
- Acceptance criteria as checkboxes.
- Dependencies and blocked-by relationships.
- Testing requirements.
- Definition of Done.
- Priority.
- Appropriate labels.

Required labels:

`type:feature`, `type:bug`, `type:refactor`, `type:security`, `type:documentation`, `type:testing`, `type:infrastructure`; `priority:critical|high|medium|low`; `status:blocked|in-progress|needs-review`; and area labels such as `area:api`, `area:web`, `area:database`, `area:auth`.

Do not create duplicate issues. Search first, then link related issues. Bugs must include reproduction steps, expected/actual behavior, environment, and severity.

### Retroactive records

Issues may be created after work completed to reconstruct history during a repository audit. Such issues must:

- Say they are retroactive and include the actual creation date.
- Reference the verified baseline commit or artifact.
- Never imply a historical PR, review, or creation date that did not exist.
- Be closed only after verification evidence is recorded.

## 5. Branch strategy

Never develop directly on `main`. `main` is production-ready and protected.

Branch formats:

```text
feature/<issue>-<description>
bugfix/<issue>-<description>
hotfix/<issue>-<description>
refactor/<issue>-<description>
docs/<issue>-<description>
test/<issue>-<description>
security/<issue>-<description>
chore/<issue>-<description>
```

Examples:

```text
feature/24-oauth-sso
bugfix/31-session-refresh
security/42-rate-limiting
docs/16-engineering-standards
```

Rules:

- One concern per branch.
- Branch from an up-to-date `main`.
- Keep branches short-lived.
- Reference the issue in every commit where practical.
- Delete the branch after merge.

### Bootstrap exception

The initial baseline commit `64c3baf` was pushed directly to `main` because the repository had no history and no remote. This is the only documented direct-to-main delivery. It predates GitHub tracking and is represented by retroactive issues. All subsequent changes require a branch and PR.

## 6. Commit standards

Use Conventional Commits:

```text
feat(auth): implement role-based access control
fix(api): correct invalid pagination handling
test(deployments): add rollback integration tests
docs(architecture): document deployment workflow
```

- Use imperative, present-tense subjects.
- Keep the subject under ~72 characters.
- Explain the why in the body when the change is non-obvious.
- Reference the issue (`Refs #12`) and use `Closes #12` only in the PR/merge context when appropriate.
- Never commit secrets, `.env`, tokens, private keys, production dumps, or local-only files.
- Commits authored through this environment must include:

```text
Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```

## 7. Pull request requirements

Every meaningful change goes through a PR that:

- References the issue and uses `Closes #<issue>`.
- Explains what changed and why.
- Summarizes implementation details.
- Lists affected components.
- Documents testing performed and commands/results.
- Includes screenshots for significant UI changes.
- Includes migration and rollback notes for database changes.
- Documents risks, security implications, and follow-ups.
- Stays focused; do not combine unrelated changes.

Use `.github/pull_request_template.md`.

## 8. Review and merge gate

For every PR, the implementer must complete an engineering self-review:

1. Read the complete diff, including generated/migration files.
2. Verify every acceptance criterion in the issue.
3. Check for unintended changes and scope creep.
4. Review security, tenant isolation, authorization, validation, and secret handling.
5. Remove duplicated or unnecessary code.
6. Confirm conventions and documentation.
7. Run typecheck, integration tests, E2E where relevant, production builds, Prisma validation, and production dependency audit.
8. Confirm required GitHub Actions checks pass.
9. Fix findings and push to the same branch.
10. Re-run the review and checks.
11. Merge only when all gates pass.

Use GitHub's actual review functionality when an independent reviewer is available. **Never create a second account, fake approval, or claim independent human review.** A self-review comment is required when no independent reviewer exists; it must be labeled as self-review.

Merge policy:

- Prefer **squash merge** for focused branches.
- Confirm the target branch is `main`.
- No unresolved blocking comments.
- No merge conflicts.
- All required checks pass.
- Delete the branch after merge.
- Verify the merge and that the linked issue closed.

Never bypass branch protection, failing checks, required reviews, or repository security policies. If blocked by permissions or protection, report the exact blocker and leave the PR open.

## 9. Definition of Done

A task is not complete because code was written. It is complete only when:

- Implementation satisfies the issue and acceptance criteria.
- Tests pass and existing behavior has not regressed.
- Typecheck, lint/format checks (when configured), E2E (when relevant), and production builds pass.
- Security and tenant-isolation implications are reviewed.
- Documentation, API/ERD docs, changelog, and ADRs are updated as needed.
- Database migrations are committed, reviewed, and deployment-safe.
- Required CI checks pass.
- The PR is self-reviewed (or independently reviewed when available), squash-merged, and the branch is deleted.
- The issue is closed by the PR linkage or manually with verification evidence.
- Milestone/project status and next work are updated.

Do not close incomplete work. Do not hide failed tests, known defects, or unresolved security concerns.

## 10. Testing matrix

| Change type | Required validation |
| --- | --- |
| API route/service | Typecheck, API integration tests, build |
| Auth/authorization/tenant logic | Above plus isolation/RBAC tests and security review |
| Database schema | Migration, generate, API tests, migration/rollback notes |
| React UI | Typecheck, build, relevant Playwright flow, screenshots |
| Realtime | Typecheck, realtime tests, multi-session smoke test |
| Infrastructure/CI | Workflow validation, build/Docker jobs, deployment notes |
| Documentation only | Link review and CI; no runtime changes |

Tests must use real PostgreSQL for database behavior. Mocks are acceptable only for external providers with a documented adapter contract.

## 11. Database and migration discipline

- Every schema change is a reviewed Prisma migration; never edit production databases manually.
- Migrations must be deployable from the current main schema and include a rollback/forward-fix plan.
- Preserve tenant scoping, indexes, and referential constraints.
- Do not remove or rewrite applied migrations.
- Seed changes must remain deterministic and clearly demo-only.
- Test migrations against a fresh `teamflow_test` database.

## 12. Security and safety boundaries

Required:

- Enforce authorization on the backend for every tenant-owned resource.
- Never trust organization IDs, roles, or project IDs from the client without membership resolution.
- Validate input with Zod; parameterize database access via Prisma.
- Keep secrets out of source, logs, screenshots, and issue bodies.
- Maintain CSRF, rate-limit, upload, and session protections.
- Add audit records for security-sensitive changes.
- Review new dependencies and run `npm audit --omit=dev`.

Stop and report before:

- Deleting important user data or performing destructive production database operations.
- Exposing private information or making a repository public without authorization.
- Changing repository ownership/access or disabling security controls.
- Bypassing branch protections, required reviews, or failing checks.
- Introducing paid services or financial commitments.
- Performing irreversible production deployments.

## 13. Releases, changelog, and decisions

- Follow Semantic Versioning.
- Record user-visible changes in `CHANGELOG.md`.
- Document significant architectural decisions in `docs/adr/` using the ADR template.
- Tag releases only from a green `main` with a reviewed changelog entry.
- Deployment must be reproducible from the committed lockfile and migrations.

## 14. GitHub operations and current constraints

Use `gh` or the authenticated GitHub API. First verify auth, repository access, permissions, and branch protections. Do not expose tokens.

Current known constraints (update this section as they change):

- Project V2 board creation is blocked: token lacks `project`/`read:project` scopes. Tracking fallback: issues + milestones. Blocked issue: #18.
- `main` branch protection is configured with required pull requests, strict up-to-date checks, conversation resolution, linear history, disabled force pushes/deletions, and required checks `Typecheck, test, build`, `End-to-end tests`, and `Docker images` (issue #19, verified via API).
- Local authoring environment has no Docker daemon; Docker image builds are verified by GitHub Actions.
- No independent human reviewer is currently assigned; self-review is required and must not be represented as independent approval. Required approvals remain 0 for this reason.
- Merge settings are squash-only; merge commits and rebase merges are disabled, merged branches auto-delete, and `allow_update_branch` remains off to preserve explicit rebases.
- Dependabot alerts/security updates, secret scanning, secret-scanning push protection, and CodeQL default setup are enabled (issue #38, verified via API).
- The Project board remains the only tracking blocker; remaining product hardening and scale work is tracked in issues #20–#34.

## 15. Session-end checklist

Before ending a session:

1. Ensure every changed file belongs to the current issue/PR.
2. Run the required validation and record results.
3. Push the branch and open/update the PR.
4. Post the self-review and any follow-up issues.
5. Merge only when gates pass; otherwise report the blocker and leave the PR open.
6. Confirm the issue closed and the branch was deleted.
7. Confirm the next priority task and leave the backlog accurate.
8. Do not leave unexplained uncommitted work or unreported failures.

## 16. Maintenance of this file

Update this file whenever engineering procedure changes. Consistency with `CONTRIBUTING.md`, issue/PR templates, and CI is mandatory. Changes to this file require a documentation issue and a PR like any other change.
