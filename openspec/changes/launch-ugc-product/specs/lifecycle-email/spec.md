## ADDED Requirements

### Requirement: Separate OTP and lifecycle channels
The system MUST use Supabase custom SMTP for OTP and the application Resend API
for lifecycle email.

#### Scenario: OTP request
- **WHEN** a valid OTP request is accepted
- **THEN** only Supabase Auth owns and sends the OTP message

### Requirement: Idempotent transactional delivery
The system SHALL record lifecycle delivery jobs with deterministic idempotency
keys and atomic claims.

#### Scenario: Retried worker
- **WHEN** a worker retries a previously sent canonical event
- **THEN** the system does not create a second provider delivery

### Requirement: Bounded invitation reminders
The system SHALL send eligible invitation reminders no more often than the
configured cooldown.

#### Scenario: Reminder inside cooldown
- **WHEN** reminder processing encounters an invited user still inside the cooldown
- **THEN** the system skips delivery without changing invitation status

### Requirement: Verified suppression projection
The system MUST verify Resend webhook signatures over the raw body before
projecting provider events.

#### Scenario: Verified complaint
- **WHEN** a valid complaint, bounce, or suppression event is received
- **THEN** the system records the event once and forces product-update opt-out

#### Scenario: Forged webhook
- **WHEN** a webhook signature is invalid
- **THEN** the system rejects the request without changing consent or delivery state
