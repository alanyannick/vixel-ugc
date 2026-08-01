## ADDED Requirements

### Requirement: Unified user and access operations
The system SHALL give approved administrators one server-owned view of waitlist,
account, role, subscription, and product-activity state.

#### Scenario: User has not created an account
- **WHEN** an administrator views an admitted email before its first OTP sign in
- **THEN** the system shows the waitlist identity and marks account-only actions unavailable

#### Scenario: Account role or status changes
- **WHEN** an administrator supplies a meaningful reason and changes an account
  role or status
- **THEN** the server validates the transition and atomically records actor,
  reason, previous state, next state, and request ID

### Requirement: Administrator lockout protection
The system MUST prevent operations that remove the final usable administrator or
silently change the current operator's own access.

#### Scenario: Last administrator demotion
- **WHEN** an operation would leave no approved, non-suspended administrator
- **THEN** the server rejects it without changing account state

#### Scenario: Self demotion or suspension
- **WHEN** an administrator targets their own role or account status
- **THEN** the server rejects the operation and requires another administrator

### Requirement: Product-owned growth summary
The operator console SHALL present a read-only funnel from waitlist through paid
use using only Vixel UGC source-of-truth data.

#### Scenario: Funnel load succeeds
- **WHEN** an administrator requests a supported time window
- **THEN** the system returns absolute counts, conversion rates, source,
generated-at time, and caveats for waitlisted, approved, account-created,
first-campaign, active-subscription, and first-paid-generation milestones

#### Scenario: A required source is unavailable
- **WHEN** a funnel or readiness source cannot be queried
- **THEN** the console displays unavailable for that source and never substitutes zero

### Requirement: Operations readiness and audit visibility
The operator console SHALL expose secret-free provider readiness, actionable
queues, and recent audit evidence.

#### Scenario: Operator reviews system state
- **WHEN** an approved administrator opens operations
- **THEN** the system shows configuration/readiness booleans and recent audited
  changes without returning credentials or provider secrets
