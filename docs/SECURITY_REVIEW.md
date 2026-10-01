# Security review — 2026-10-01

Scope: initial commit `299cd7e`, application source, launcher, AI integration, persistence, frontend rendering, GitHub Actions, locked dependencies and current local file permissions. This is a review, not a penetration-test certification. No application fixes, paid AI calls or pushes were made.

## Findings

### Medium — Sensitive local files allow reads by other local users

The current `.env` and `data/compass.sqlite` have POSIX mode `0644`. The data directory and parent directories through the home directory have mode `0755`. Other local users can therefore read these files under these POSIX permissions. The environment file holds the API credential; SQLite holds private notes, journal entries, sizing inputs and captured AI context. Git exclusion prevents publication but does not restrict local reads.

`backend/compass/persistence.py:11` creates the data directory with default permissions and SQLite creates files under the process umask. The launcher does not establish a private umask.

Recommended fix: make `.env` and database files owner-readable/writable only (`0600`), the private data directory owner-only (`0700`), and use a restrictive umask for future database, journal and backup files. Apply this to existing files as well as newly created files. Do not print the key during remediation. OS ACLs or stronger account isolation can change effective access; no login as a second user was attempted.

### Medium — Missing frame protection permits clickjacking

`backend/compass/api.py:79` adds `X-Content-Type-Options` but neither a CSP `frame-ancestors` directive nor `X-Frame-Options`. An isolated TestClient request to `/` with a foreign Origin and iframe fetch metadata returned HTTP 200 with both frame protections absent.

Where the browser permits a website to frame the loopback app, a malicious page can conceal the application under deceptive controls and steer user clicks into research changes or paid AI generation. The framed application sends its own requests from an allowed local origin, so the existing write-origin check does not stop this flow. Browser restrictions on access to local-network resources can reduce exploitability; a real-browser clickjacking exploit was not executed.

Recommended fix: return `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on application responses. Verify the paid summary UI cannot be embedded by another origin.

## Verified protections

- Launcher binds Uvicorn to `127.0.0.1`; frontend development also binds to loopback.
- Foreign and `null` origins on note writes returned 403. Foreign Host returned 400. Foreign-origin reads had no CORS permission.
- SQLite statements use parameterized values; dynamic AI query column names come from a fixed internal list.
- Ticker validation prevents arbitrary paths or URLs from becoming provider identifiers.
- React renders research and AI text as text. News links are filtered to HTTPS by the provider; AI evidence links also check HTTPS. No raw HTML rendering was found in the reviewed frontend.
- API credentials stay in backend configuration. Public AI status omits the credential. Provider diagnostics retain bounded fields rather than raw provider messages. AI generation uses `store=False`, no automatic retries, and no executable tools.
- AI context includes an explicit instruction to treat research text as evidence rather than instructions. Output has constrained citations and price levels. This reduces risk but cannot establish that every free-text AI conclusion is reliable.
- Git does not track `.env`, database files or private-key files. Actions use SHA-pinned actions, read-only repository permissions, disabled AI and no persisted checkout credentials.

## Dependency audits and limits

- `npm audit --prefix frontend --registry=https://registry.npmjs.org --json`: zero known vulnerabilities, exit 0.
- Isolated `pip-audit -r requirements.lock --no-deps --disable-pip --format json`: zero known vulnerabilities across the pinned Python dependencies, exit 0. The audit tool ran outside the project environment.
- The first npm audit used the machine's HTTP registry default and failed with HTTP 426. Retrying with explicit HTTPS succeeded; setup already specifies HTTPS. No npm configuration was changed.
- Audits report known advisories, not proof that dependencies are safe. Python artifact hashes are not pinned in the lockfile.
- The API intentionally has no user authentication. Loopback binding is part of its security boundary; internet or shared-network hosting requires a separate authenticated deployment design. Local processes can access the API without an Origin header. A synthetic cross-site fetch-metadata header without Origin was also accepted; this alone does not demonstrate a browser CSRF exploit.
- Request middleware has no global body-size limit; field limits apply after JSON parsing. This remains a local resource-exhaustion hardening opportunity.
- Runtime checks used disposable offline databases. No real research records were modified, no key values were printed, and no OpenAI generation was requested.
