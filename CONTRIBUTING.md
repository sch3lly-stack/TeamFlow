# Contributing to TeamFlow

Read [`AGENTS.md`](AGENTS.md) first. It is the permanent engineering rulebook for this repository. This guide explains the practical workflow; if the two conflict, the stricter security/review rule applies.

## Ways to contribute

- Pick an open GitHub issue that is not blocked and is not already assigned.
- Comment on the issue with your intended approach before large changes.
- For security vulnerabilities, do not open a public issue. Follow the process in [`SECURITY.md`](SECURITY.md) once available; until then use GitHub's private vulnerability reporting.
- Use an issue for every meaningful change. Questions that do not change the repository can be discussions or comments.

## Setup

Prerequisites: Node.js 20+, npm 10+, PostgreSQL 16 (or Docker).

```bash
cp .env.example .env
# Set DATABASE_URL and a strong JWT_ACCESS_SECRET
npm install
createdb teamflow
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:4000`. Demo accounts use `Password123!`; see the README.

## Branch and issue workflow

1. Find or create the issue. Ensure acceptance criteria, priority, labels, and milestone are present.
2. Branch from up-to-date `main`:
   ```bash
   git switch main
   git pull --ff-only
   git switch -c feature/24-description
   ```
3. Use one of: `feature/`, `bugfix/`, `hotfix/`, `refactor/`, `docs/`, `test/`, `security/`, `chore/` followed by `<issue-number>-<short-description>`.
4. Commit with Conventional Commits:
   ```text
   feat(api): add cursor pagination to activity
   ```
5. Push and open a PR using the template. Use `Closes #24`.
6. Self-review the complete diff, run the validation matrix, and address findings.
7. Squash-merge only after required checks pass; delete the branch.

## Validation matrix

| Change | Commands |
| --- | --- |
| All code | `npm run typecheck`, `npm run build` |
| API behavior | `npm test` |
| UI behavior | `npm run test:e2e` with a seeded DB |
| Database | `npx prisma validate`, migrate, regenerate, API tests |
| Dependencies | `npm audit --omit=dev`, lockfile review |
| Docs only | link check, `npm run typecheck`/build if code examples changed |

Integration tests use `TEST_DATABASE_URL` (default `teamflow_test`). Create it with `createdb teamflow_test`; the test setup applies migrations and resets test data.

## Code standards

- TypeScript strict mode; no `any` unless justified at a boundary.
- Validate external input with Zod; use Prisma parameterization.
- Keep tenant scoping explicit: resolve the caller's membership for the resource's organization.
- Enforce permissions on the backend; never rely on hidden UI controls.
- Prefer small, focused modules and existing patterns.
- Add comments only where the logic is non-obvious.
- No secrets, tokens, `.env` files, private dumps, or local editor state in commits.
- Do not add dependencies without an issue and security review.

## Database changes

- Create a Prisma migration; never edit an applied migration.
- Include indexes and constraints required by the query pattern.
- Test from a fresh test database.
- Document migration and rollback/forward-fix notes in the PR.
- Never run destructive commands against production data.

## Pull request checklist

- [ ] Linked issue with acceptance criteria satisfied.
- [ ] Focused diff; no unrelated changes.
- [ ] Screenshots for significant UI changes.
- [ ] Tests added/updated where behavior changes.
- [ ] Typecheck, tests, E2E (if relevant), and build pass.
- [ ] Migration notes included (if relevant).
- [ ] Security/tenant-isolation review completed.
- [ ] Documentation/changelog updated.
- [ ] Self-review posted; independent review used if available.
- [ ] Required CI checks green; PR squash-merged.

## Reviewing

Review for correctness, security, tenant isolation, error handling, unnecessary complexity, test quality, documentation, and operational impact. Do not approve a PR you do not understand. Do not represent a self-review as independent human approval.

## Releases

- Follow SemVer.
- Update `CHANGELOG.md`.
- Add an ADR for significant architecture decisions.
- Release only from green `main`.

## Reporting issues

Use the issue templates. Include version/commit, environment, reproduction steps, expected vs actual behavior, and relevant logs with secrets removed. For security issues, avoid public disclosure.
