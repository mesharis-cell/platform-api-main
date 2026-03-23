# Kadence Platform — Security Scanning Overview

**Prepared by:** PMG Agency FZ-LLC
**Platform:** Kadence Asset Fulfillment & Tracking Platform
**Date:** March 2026

---

## Summary

The Kadence platform implements continuous security monitoring across all application components using industry-standard tools. This document outlines the scanning methodology, coverage, and remediation process.

---

## 1. Dependency Vulnerability Scanning — Snyk

**Tool:** [Snyk](https://snyk.io) (industry-leading SCA tool)
**Coverage:** All 4 platform repositories

| Repository | Stack | Scan Frequency |
|------------|-------|----------------|
| platform-api | Express.js 5, TypeScript, PostgreSQL | Continuous (every push) |
| platform-admin | Next.js, React, TanStack Query | Continuous (every push) |
| platform-client | Next.js, Better Auth | Continuous (every push) |
| platform-warehouse | Next.js PWA | Continuous (every push) |

**What it checks:**
- All npm dependencies against the Snyk vulnerability database (170,000+ known vulnerabilities)
- Transitive (indirect) dependency chains
- License compliance issues
- Publicly disclosed CVEs with severity ratings (Critical / High / Medium / Low)

**Outputs:**
- Per-repository vulnerability report with CVE references
- Affected package versions and upgrade paths
- Remediation recommendations (auto-fix PRs where possible)
- Historical scan data proving continuous monitoring

---

## 2. Application Security Testing — OWASP ZAP

**Tool:** [OWASP ZAP](https://www.zaproxy.org) (OWASP Foundation's flagship DAST tool)
**Coverage:** Staging API and frontend applications
**Scan Type:** Baseline + Active scanning against staging environments

**What it checks (OWASP Top 10):**
- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection (SQL, NoSQL, Command, XSS)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable and Outdated Components
- A07: Identification and Authentication Failures
- A08: Software and Data Integrity Failures
- A09: Security Logging and Monitoring Failures
- A10: Server-Side Request Forgery (SSRF)

**Outputs:**
- Formal HTML report with executive summary
- Risk ratings per finding (High / Medium / Low / Informational)
- Affected URLs, parameters, and evidence
- OWASP classification and CWE references
- Remediation guidance per finding

**Scan frequency:** Monthly baseline scan + on-demand before major releases

---

## 3. Secret Detection — Bitbucket

**Tool:** Bitbucket native secret scanning
**Coverage:** All repositories, every commit
**What it checks:** Accidentally committed API keys, tokens, passwords, private keys

---

## Remediation Process

| Severity | Response Time | Action |
|----------|--------------|--------|
| Critical | Within 24 hours | Immediate patch or mitigation deployed |
| High | Within 48 hours | Patch scheduled and deployed within sprint |
| Medium | Within 1 sprint | Included in next development cycle |
| Low / Informational | Monthly review | Assessed and addressed as appropriate |

All findings are tracked in our internal issue tracker. Critical and high severity findings trigger immediate developer notification.

---

## Infrastructure Security (Additional Measures)

- **HTTPS enforced** across all endpoints (TLS 1.2+ only)
- **CORS policy** with dynamic origin validation (database-driven, not wildcard)
- **JWT authentication** with short-lived access tokens and refresh rotation
- **Role-based access control** with platform → company → user scoping
- **Database** hosted on Supabase with connection pooling and SSL enforcement
- **File storage** via AWS S3 with presigned URLs (no public buckets)
- **Password hashing** via bcrypt with configurable salt rounds
- **Rate limiting** and request validation via Zod schemas on all API endpoints

---

## Report Availability

Security scan reports are generated on each scan cycle and are available upon request under NDA. Reports include:

1. **Snyk Dependency Report** — PDF with CVE details, per repository
2. **OWASP ZAP Application Report** — HTML with OWASP Top 10 assessment
3. **This overview document** — Summary of methodology and process

For report requests, contact: support@kadence.ae

---

*This document is confidential and intended for authorized recipients only.*
