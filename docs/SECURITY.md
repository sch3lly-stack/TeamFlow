# Security

TeamFlow handles cross-tenant project data, so isolation and authorization are treated as backend invariants rather than UI states.

## Threat model

Assets: organization data, private tasks/comments/attachments, user identity and sessions, audit trail.

Adversaries considered:

1. An authenticated member of organization A attempting to read or mutate organization B data by guessing IDs.
2. A low-privilege member attempting actions outside their role (for example a read-only user creating tasks).
3. An attacker with a stolen short-lived access cookie.
4. Cross-site request forgery and cross-origin browser attacks.
5. Malicious file uploads (path traversal, active content, oversized files).
6. Credential stuffing and brute force against authentication endpoints.
7. Accidental privilege loss (removing/demoting the last owner).

## Controls

### Authentication

- Passwords hashed with scrypt (N=16384, r=8, p=1), unique 16-byte salt, constant-time comparison, dummy verification for unknown emails to reduce timing side channels.
- Access tokens: HS256 JWT, 15-minute default, `iss` validated, HttpOnly + `SameSite=Lax` cookie.
- Refresh tokens: 48 random bytes, only SHA-256 hashes stored, HttpOnly cookie limited to `/api/auth`, 30-day expiry, rotated on refresh, revoked on reuse/logout/password change.
- Password change revokes all refresh tokens and issues a fresh session.
- Strict password minimum (10 characters), email normalization, generic login failures.

### Authorization and isolation

- Every request resolves a membership from `(userId, organizationId)`. Foreign resource IDs return `404`.
- Project/task access is derived from the resource's stored organization, never a client-supplied tenant.
- Capability matrix is backend-owned (`domain/permissions.ts`); the frontend copy is only for hiding controls.
- Project-level roles can narrow (viewer) or extend (manager) org roles; enforced server-side.
- Owner guardrails: only Owners manage Owners; last Owner cannot be demoted/removed; Admins cannot grant Owner.
- Tests explicitly attempt cross-tenant reads/writes, assignments, dependencies, comments, search, notifications, and workload access.

### Input and transport

- Zod validation on all mutation bodies and query parameters; bounded list sizes and date ranges.
- 1 MB JSON/urlencoded limits; files limited separately.
- Helmet security headers, disabled `x-powered-by`, explicit CORS allow-list with credentials, origin verification for mutations.
- CSRF double-submit token with timing-safe comparison; Bearer requests exempt by design.
- Rate limiting: global API bucket plus stricter auth and upload buckets. In-memory store; see production checklist.
- Prisma parameterization prevents SQL injection; no raw user input interpolation.

### Files

- Server-generated random filenames; original filenames sanitized for display only.
- MIME allow-list, 10 MB default limit, no SVG (avoids script execution), stored outside static roots.
- Downloads require task → project → membership access and are sent as attachments with `nosniff`.
- Failed database writes unlink the stored file; deleting an attachment removes both record and file.

### Audit and monitoring

- `AuditLog` captures authenticated security actions: registrations, login success/failure, profile and password changes, role changes, member removal, invitations, project create/update/archive, task deletion, report export. Includes actor, organization, IP, user agent, and metadata.
- `ActivityLog` provides a human-readable project/task trail and powers feeds.
- Structured Pino logging with redaction of cookies, authorization headers, passwords, and set-cookie headers.
- Audit writes are best-effort so a logging failure cannot block a legitimate mutation; failures are logged.

## OWASP Top 10 mapping

| Risk | Mitigation |
| --- | --- |
| A01 Broken access control | Membership-derived tenant scoping, capability checks, project roles, 404 for foreign IDs, isolation test suite |
| A02 Cryptographic failures | scrypt password hashing, SHA-256 refresh hashes, signed JWT, HttpOnly/Secure cookies in production, no secrets in logs |
| A03 Injection | Prisma parameterized queries, Zod validation, React text rendering (no raw HTML), sanitized upload names |
| A04 Insecure design | Explicit role matrix, owner guardrails, one active sprint, dependency cycle prevention, archive-not-delete for projects |
| A05 Security misconfiguration | Helmet, CORS allow-list, disabled powered-by, environment validation, secure cookie defaults in production, Docker non-root API |
| A06 Vulnerable components | Locked dependency tree, `npm audit` in review, CI installs from lockfile |
| A07 Authentication failures | Rate limits, generic errors, short access lifetime, rotating hashed refresh tokens, revocation, timing-safe checks |
| A08 Data integrity failures | Transactions for multi-table mutations, unique constraints, atomic task numbering, audit trail |
| A09 Logging failures | Audit log, activity log, structured redacted logs, health endpoint |
| A10 SSRF | No user-supplied outbound URLs; URL fetches are not part of the product surface |

## Verification

- `apps/api/tests/isolation.test.ts` — cross-tenant access on resources, search, workload, notifications, comments, dependencies.
- `apps/api/tests/permissions.test.ts` — read-only enforcement, developer vs project manager capabilities, team lead boundaries, owner protections.
- `apps/api/tests/auth.test.ts` — cookie flags, CSRF rejection, refresh rotation, logout revocation, password change.
- `apps/api/tests/tasks.test.ts`, `db.test.ts`, `realtime.test.ts` — workflow integrity, constraints/cascades, socket fan-out and assignee notifications.
- `apps/web/e2e` — UI credential failure, read-only affordances, authenticated task lifecycle.

## Production checklist

- [ ] Set a long random `JWT_ACCESS_SECRET` (rotate periodically; rotation invalidates sessions).
- [ ] Use HTTPS and `COOKIE_SECURE=true`; configure `COOKIE_DOMAIN` if needed.
- [ ] Replace default PostgreSQL credentials; restrict network access to the database.
- [ ] Run `prisma migrate deploy` as a release step; back up before migrations.
- [ ] Use Redis for rate limiting and the Socket.IO adapter when running more than one API replica.
- [ ] Move uploads to object storage with encryption, signed URLs, retention rules, and malware scanning.
- [ ] Add an email provider for invitations and notification digests (never expose invite tokens in logs).
- [ ] Ship structured logs/metrics/traces to a central system; alert on failed logins, audit gaps, and 5xx spikes.
- [ ] Add CSRF/origin tests to the deployment smoke suite; verify CORS origins exactly.
- [ ] Define audit retention and access-review policy; export audit data to immutable storage if required.
- [ ] Review dependency advisories on every release; enable Dependabot/Renovate.

## Reporting

If you find a security issue, do not open a public issue with exploit details. Contact the maintainer privately with reproduction steps and an impact assessment.
