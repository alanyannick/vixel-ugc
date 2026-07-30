# Errors

## [ERR-20260730-008] vercel-domain-direct-connect

**Logged**: 2026-07-30T03:18:00+08:00
**Priority**: low
**Status**: resolved
**Area**: release

### Summary

Direct `curl` and Node requests to the Vercel production alias bypassed the
macOS system proxy, resolved through the local network path, and failed before
TLS.

### Error

```text
LibreSSL SSL_connect: SSL_ERROR_SYSCALL
UND_ERR_CONNECT_TIMEOUT
```

### Context

- Vercel's control plane already reported the deployment as `READY`.
- macOS had an HTTPS proxy configured on `127.0.0.1:7897`, but command-line
  clients did not inherit it automatically.
- No production state changed during the failed requests.

### Suggested Fix

For production verification on this machine, pass the existing local proxy
explicitly to command-line clients. Do not store the workstation proxy in
project configuration.

### Resolution

- **Resolved**: 2026-07-30T03:19:00+08:00
- **Notes**: Repeated the health request with the explicit HTTPS proxy and
  received HTTP 200, readiness `true`, HSTS, CSP, COOP, and CORP.

---

## [ERR-20260730-001] sips-webp-conversion

**Logged**: 2026-07-30T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary

The macOS `sips` binary on this machine can read the generated PNG files but
cannot encode WebP.

### Error

```text
Error: Can't write format: org.webmproject.webp
Error 13: an unknown error occurred
```

### Context

- Attempted to convert three project-bound ImageGen PNG assets to WebP.
- Source PNG files were copied successfully at the time, then removed after the
  verified WebP replacements shipped.
- Environment: macOS, `sips` system binary.

### Suggested Fix

Use the project `sharp` dependency after installation for deterministic WebP
conversion, then verify dimensions and file sizes.

### Metadata

- Reproducible: yes
- Related Files: public/media/koc-serum-creator.webp

### Resolution

- **Resolved**: 2026-07-30T02:07:00+08:00
- **Notes**: Used the already-installed `/opt/homebrew/bin/cwebp` encoder at
  quality 86. The three WebP files are 87–187 KiB, down from 1.6–2.2 MiB.

---

## [ERR-20260730-006] playwright-browser-download-reset

**Logged**: 2026-07-30T02:43:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

The Playwright Chromium archive download repeatedly reset during TLS transfer.

### Error

```text
ECONNRESET while downloading the Playwright browser archive
```

### Context

- The machine already had a compatible installed Chrome.
- No application or browser profile data was modified by the failed download.

### Suggested Fix

Use Playwright's installed Chrome channel in this workspace and reserve bundled
browser downloads for environments where the artifact CDN is reachable.

### Resolution

- **Resolved**: 2026-07-30T02:47:00+08:00
- **Notes**: Configured the Chrome channel; the four desktop/mobile E2E tests
  completed successfully.

---

## [ERR-20260730-007] broad-env-url-scan-exposed-credential

**Logged**: 2026-07-30T03:04:00+08:00
**Priority**: high
**Status**: resolved
**Area**: security

### Summary

A diagnostic URL inventory included a credential-bearing database URL from a
separate local project's environment file in terminal output.

### Error

```text
A connection URL was printed before host-only redaction was applied.
```

### Context

- The credential was not copied into this project, committed, deployed, or
  included in any user-facing response.
- The scan was read-only, but its output scope was broader than necessary.

### Suggested Fix

Never print raw environment values. Parse and redact within the same process
before output, or print variable names and capability booleans only.

### Resolution

- **Resolved**: 2026-07-30T03:05:00+08:00
- **Notes**: No shared database was reused. The KOC production deployment keeps
  live generation disabled until it has an explicitly isolated database and a
  secure HTTPS provider. The local environment file was tightened to mode 0600.

---

## [ERR-20260730-006] paid-boundary-test-order

**Logged**: 2026-07-30T02:56:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

Legacy media-route tests expected provider behavior before satisfying the new
session, approval, and durable-ledger preconditions.

### Error

```text
expected 401 to be 502
expected 401 to be 503
```

### Context

- The paid control plane intentionally moved authentication and durable
  admission ahead of all provider IO.
- The failures showed stale test expectations, not a runtime regression.

### Suggested Fix

Test provider sanitization directly at the adapter boundary, and test route
handlers for the new fail-closed ordering independently.

### Metadata

- Reproducible: yes
- Related Files: src/lib/server/server.test.ts, src/app/api/media/image/route.ts

### Resolution

- **Resolved**: 2026-07-30T02:56:00+08:00
- **Notes**: Tests were updated to assert that missing session, database, or
  signed approval prevents provider fetch.

---

## [ERR-20260730-002] playwright-browser-binary-missing

**Logged**: 2026-07-30T02:20:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary

The standalone Playwright screenshot command could not start because its
versioned Chromium headless-shell binary was not installed in the local cache.

### Error

```text
Executable doesn't exist at ~/Library/Caches/ms-playwright/chromium_headless_shell-1234/...
```

### Context

- Occurred during a marketing-surface visual smoke check.
- The user's existing Chrome browser remained available through the in-app
  browser controller.

### Suggested Fix

Use the already-available Chrome session for the visual pass, or run
`npx playwright install chromium` before the standalone Playwright suite.

### Resolution

- **Resolved**: 2026-07-30T02:24:00+08:00
- **Notes**: The marketing agent completed desktop and mobile checks with the
  connected Chrome runtime and reported zero console errors.

---

## [ERR-20260730-003] zsh-readonly-status-variable

**Logged**: 2026-07-30T02:21:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

A shell smoke script attempted to assign to zsh's read-only `status` variable.

### Error

```text
zsh: read-only variable: status
```

### Context

- Occurred while checking SEO endpoint response codes.
- It did not change application files or invalidate the later checks.

### Suggested Fix

Use a task-specific name such as `route_code`; never reuse shell/system option
names for task variables.

### Resolution

- **Resolved**: 2026-07-30T02:24:00+08:00
- **Notes**: Endpoint smoke was rerun with a task-prefixed variable and all five
  SEO endpoints returned HTTP 200.

---

## [ERR-20260730-004] browser-bootstrap-export-name

**Logged**: 2026-07-30T02:31:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

The browser helper was bootstrapped with an obsolete `setup()` export name.

### Error

```text
setupModule.setup is not a function
```

### Context

- The installed browser helper exports `setupBrowserRuntime` and
  `focusChromeTab`.
- No browser state or application data was changed by the failed call.

### Suggested Fix

Inspect the module exports, then call
`setupBrowserRuntime({ globals: globalThis, elicitationDisplayName })`.

### Resolution

- **Resolved**: 2026-07-30T02:32:00+08:00
- **Notes**: Reinitialized the in-app browser with `setupBrowserRuntime`, read
  the runtime documentation, and completed desktop/mobile product QA.

---

## [ERR-20260730-005] eslint-10-next-plugin-incompatibility

**Logged**: 2026-07-30T02:39:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tooling

### Summary

ESLint 10.8.0 is newer than the React lint plugins bundled with
`eslint-config-next@16.2.12` and fails while loading `react/display-name`.

### Error

```text
TypeError: contextOrFilename.getFilename is not a function
```

### Context

- The upgrade was evaluated while remediating npm advisories.
- Production Sharp and PostCSS advisories were fixed independently through
  compatible package overrides.

### Suggested Fix

Stay on the supported ESLint 9 line until the Next-bundled React plugins add
ESLint 10 compatibility. Keep production dependency remediation separate from
dev-tool major upgrades.

### Resolution

- **Resolved**: 2026-07-30T02:41:00+08:00
- **Notes**: Pinned ESLint 9.39.5. Lint passes, and
  `npm audit --omit=dev` reports zero production vulnerabilities.

---
