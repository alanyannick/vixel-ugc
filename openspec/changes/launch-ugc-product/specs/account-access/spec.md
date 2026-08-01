## ADDED Requirements

### Requirement: Passwordless account authentication
The system SHALL authenticate customer accounts with a six-digit Supabase email
OTP delivered through custom SMTP.

#### Scenario: Valid OTP
- **WHEN** a user verifies a valid unexpired OTP
- **THEN** the system creates a signed HTTP-only application session for that Supabase user

#### Scenario: Invalid OTP
- **WHEN** a user submits an invalid, expired, or replayed OTP
- **THEN** the system rejects authentication without creating an application session

### Requirement: Production bot protection
The system MUST require a valid Cloudflare Turnstile result before requesting an
OTP in production. Supabase Auth MUST redeem the single-use challenge itself so
the same protection also applies to direct Auth API calls made with the public
project URL and publishable key. Every application environment connected to that
Supabase project MUST configure the matching Turnstile site and secret keys;
account-auth readiness fails closed when they are absent.

#### Scenario: Missing challenge
- **WHEN** a production OTP request has no valid Turnstile token
- **THEN** Supabase Auth rejects the request before sending email, whether the
  request comes through the application route or directly through the Auth API

#### Scenario: Single-use challenge
- **WHEN** the application requests an email OTP after Turnstile succeeds
- **THEN** it forwards the token to Supabase Auth without redeeming it first,
  and Supabase redeems it exactly once

#### Scenario: Challenge cannot execute
- **WHEN** Turnstile reports a browser, blocker, timeout, expiry, or script error
- **THEN** the form prevents submission, explains a safe recovery action, and
  allows the user to retry without weakening server verification

### Requirement: Same-email onboarding continuation
The system SHALL continue a successful waitlist request into passwordless
account setup without exposing the submitted email in a URL.

#### Scenario: Waitlist request recorded
- **WHEN** a visitor receives a successful waitlist response
- **THEN** the page explains that the same email creates or signs in to the
  account, provides a Studio setup action, and preserves pending access until
  operator approval

### Requirement: Status and role authorization
The system SHALL route authenticated users according to server-owned account
status and role.

#### Scenario: Pending account
- **WHEN** an authenticated pending user requests Studio
- **THEN** the system shows waitlist status and does not expose Studio data

#### Scenario: Approved account
- **WHEN** an authenticated approved user requests Studio
- **THEN** the system allows access to that user's Studio data

#### Scenario: Non-admin account
- **WHEN** an authenticated non-admin requests an admin API or page
- **THEN** the system returns a forbidden result without admin data

### Requirement: Secret-minimized browser session
The system MUST keep provider secrets and long-lived Supabase credentials out of
browser storage and rendered content.

#### Scenario: Session exchange
- **WHEN** OTP verification is exchanged for an application session
- **THEN** subsequent product requests use only the signed HTTP-only application cookie

### Requirement: Single identity boundary
The private beta SHALL use email OTP only. Any future identity provider MUST
resolve to the same Supabase user ID, account profile, and application session.

#### Scenario: Private beta sign in
- **WHEN** a user opens account access during private beta
- **THEN** email OTP is the only customer sign-in method presented

#### Scenario: Future provider identity conflict
- **WHEN** a future provider resolves to an email already bound to a different
  immutable user ID
- **THEN** the system fails closed without overwriting the existing binding
