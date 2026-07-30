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
OTP in production.

#### Scenario: Missing challenge
- **WHEN** a production OTP request has no valid Turnstile token
- **THEN** the system rejects the request before Supabase sends email

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
