# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x (current `main`) | Yes |
| Pre-release snapshots | Best effort |

## Reporting a vulnerability

**Do not open a public issue with exploit details, credentials, private tenant
data, or reproduction steps for an unpatched vulnerability.**

Use GitHub's private vulnerability reporting:

**https://github.com/sch3lly-stack/TeamFlow/security/advisories/new**

Include, when possible:

- Affected version or commit.
- Affected component and tenant boundary.
- Reproduction steps and a minimal proof of concept.
- Impact assessment (confidentiality, integrity, availability, cross-tenant exposure).
- Suggested remediation, if known.
- Whether the issue has been disclosed elsewhere.

The maintainer will acknowledge the report, validate the impact, coordinate a
fix and release, and credit the reporter if desired. Do not include secrets in
the report; use redacted values.

## Scope

In scope:

- Authentication, session, CSRF, and authorization bypasses.
- Cross-organization data access or privilege escalation.
- Insecure file upload/download or path traversal.
- Injection, SSRF, XSS, and unsafe deserialization in application code.
- Leakage of secrets, tokens, private attachments, or audit data.
- Dependency vulnerabilities reachable from the running application.

Out of scope:

- Findings requiring a compromised developer machine or stolen production
  credentials without an additional application flaw.
- Automated scanner output without a demonstrated impact.
- Social engineering of maintainers.
- Denial-of-service through unrealistic resource exhaustion against a demo host.

## Security engineering references

- [Threat model, OWASP mapping, controls and production checklist](docs/SECURITY.md)
- [Architecture and tenant isolation model](docs/ARCHITECTURE.md)
- [Engineering rules](AGENTS.md)

## Safe harbor

Good-faith research that follows this policy, avoids privacy violations and
service disruption, and does not access data beyond what is necessary to
demonstrate a finding will not be pursued by the maintainer. This is not a
waiver of any law or third-party rights.
