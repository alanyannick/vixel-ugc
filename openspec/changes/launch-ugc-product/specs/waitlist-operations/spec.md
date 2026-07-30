## ADDED Requirements

### Requirement: Idempotent public waitlist capture
The system SHALL accept a normalized public waitlist submission and maintain one
canonical entry per email address.

#### Scenario: First submission
- **WHEN** a visitor submits valid waitlist data
- **THEN** the system creates a pending entry and a single confirmation delivery job

#### Scenario: Duplicate submission
- **WHEN** the same normalized email submits again
- **THEN** the system updates allowed profile fields without duplicating the person or canonical confirmation

### Requirement: Explicit product-update consent
The system MUST treat product-update consent as optional and default-off.

#### Scenario: Consent omitted
- **WHEN** a waitlist submission omits or clears product-update consent
- **THEN** the canonical preference remains opted out

### Requirement: Protected operator workflow
The system SHALL allow an admin to review, filter, annotate, approve, reject,
invite, and revoke waitlist entries.

#### Scenario: Approve an entry
- **WHEN** an admin approves a pending entry
- **THEN** the system records the transition and audit event atomically

#### Scenario: Invalid transition
- **WHEN** an admin requests a transition not allowed by the status state machine
- **THEN** the system rejects it without partial changes or email jobs

### Requirement: Auditable invitation lifecycle
The system SHALL make invitation changes replay-safe and auditable.

#### Scenario: Invite approved user
- **WHEN** an admin invites an approved entry
- **THEN** the system records the invitation, enqueues one invite email, and records the actor
