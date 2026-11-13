# ADR-0003: Session and token strategy

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** None

## Context

The SPA needs secure browser authentication without exposing long-lived bearer
tokens to JavaScript. Sessions must be revocable, survive normal token expiry,
resist CSRF, and remain practical for API clients and tests.

## Decision

- Passwords use Node `scrypt` with per-user salt and constant-time verification.
- Access tokens are HS256 JWTs with a short lifetime (15 minutes default),
  delivered in an HttpOnly, SameSite=Lax, Secure-in-production cookie.
- Refresh tokens are 48 random bytes delivered in an HttpOnly cookie scoped to
  `/api/auth`; only a SHA-256 hash is stored. Every refresh rotates the token and
  revokes the prior row. Logout and password change revoke sessions.
- CSRF uses a non-HttpOnly `tf_csrf` cookie and required `X-CSRF-Token`
  double-submit with timing-safe comparison. Bearer requests are exempt.
- Origin allow-listing protects mutating browser requests.
- Login/register/password-change are rate-limited; refresh is protected by a
  48-byte secret token and the global rate limit rather than the low login bucket.
- API clients may use `Authorization: Bearer <access token>`.

## Consequences

### Positive

- Refresh tokens are revocable and cannot be replayed after rotation.
- XSS does not directly read the access/refresh cookies.
- Users do not re-authenticate every 15 minutes.

### Negative / trade-offs

- CSRF logic is required for cookie-auth mutations.
- Refresh rotation adds database writes; replay races require careful handling.
- A stolen access cookie remains valid until its short expiry.

### Follow-ups

- Add Redis rate limiting for multi-instance deployments (issue #24).
- Consider session/device management UI and anomaly detection.
- Add SSO/SCIM later without changing the session foundation (issue #28).

## Alternatives considered

| Alternative | Why not chosen |
| --- | --- |
| JWT in localStorage | Exposes credentials to XSS; worse than HttpOnly cookies. |
| Server-side session only | Requires shared session storage; viable but does not simplify CSRF. |
| Non-rotating refresh tokens | Weak replay detection and revocation guarantees. |

## Verification

`apps/api/tests/auth.test.ts` covers cookie flags, refresh rotation/reuse,
logout revocation, CSRF rejection, and password change. Security review is
documented in `docs/SECURITY.md`.
