# Errors

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
- Source PNG files were copied successfully and remain intact in `public/media/`.
- Environment: macOS, `sips` system binary.

### Suggested Fix

Use the project `sharp` dependency after installation for deterministic WebP
conversion, then verify dimensions and file sizes.

### Metadata

- Reproducible: yes
- Related Files: public/media/koc-serum-creator.png

### Resolution

- **Resolved**: 2026-07-30T02:07:00+08:00
- **Notes**: Used the already-installed `/opt/homebrew/bin/cwebp` encoder at
  quality 86. The three WebP files are 87–187 KiB, down from 1.6–2.2 MiB.

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
