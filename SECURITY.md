# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them
privately through GitHub: **Security → Report a vulnerability** on this
repository. Include steps to reproduce and the impact you expect.

You can expect an acknowledgement within 3 working days and a fix or
mitigation plan within 14 days for confirmed issues.

## Scope

In scope: the application code in this repository (API, authentication and
permissions, stock ledger integrity, integrations and webhooks) and the
deployment files under `deploy/` and `ops/`.

## Hardening already in place

- Session cookies are httpOnly and SameSite; passwords use scrypt; logins lock after repeated failures
- Role-based permissions are checked on every API route and page
- The database runs under a least-privilege login, with append-only ledger and audit tables enforced by triggers
- Security headers (CSP, HSTS, frame denial, nosniff, Permissions-Policy) are sent on every response
- Webhook endpoints are restricted to public HTTPS addresses (SSRF guard) and signed with HMAC-SHA256
- CI runs CodeQL, a dependency audit and dependency review; Dependabot opens weekly update PRs
