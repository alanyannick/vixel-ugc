## ADDED Requirements

### Requirement: User-owned campaign persistence
The system SHALL persist campaign snapshots in the cloud for approved users.

#### Scenario: Reload on another browser
- **WHEN** an approved user signs in on another browser
- **THEN** the system returns that user's latest campaign snapshots

#### Scenario: Cross-user access
- **WHEN** a user requests or mutates a campaign owned by another user
- **THEN** the system returns no campaign data and makes no change

### Requirement: Optimistic revision safety
The system MUST reject stale campaign writes.

#### Scenario: Stale revision
- **WHEN** a campaign update supplies an older expected revision
- **THEN** the system returns a conflict with the current revision and preserves current data

### Requirement: Stable generation ownership
The system SHALL associate paid-generation jobs with the immutable account owner.

#### Scenario: Cross-device recovery
- **WHEN** an approved user recovers a recorded job from another device
- **THEN** the server authorizes recovery using account ownership and existing receipt checks
