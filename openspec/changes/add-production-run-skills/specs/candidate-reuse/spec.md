# Candidate reuse

## ADDED Requirements

### Requirement: Image candidate reuse is explicit and traceable

The system SHALL allow a user to reuse an existing image candidate as either the product reference or creator reference.

#### Scenario: Reuse as product reference

- **WHEN** the user chooses Reuse as product reference on an image candidate
- **THEN** the campaign product reference SHALL use that candidate image
- **AND** the campaign SHALL store compact candidate lineage for the product role
- **AND** exactly one receipt SHALL record the mutation

#### Scenario: Reuse as creator reference

- **WHEN** the user chooses Reuse as creator reference on an image candidate
- **THEN** the campaign creator reference SHALL use that candidate image
- **AND** the campaign SHALL store compact candidate lineage for the creator role
- **AND** exactly one receipt SHALL record the mutation

### Requirement: Reuse does not execute providers

Candidate reuse SHALL be a campaign mutation only.

#### Scenario: Reuse action

- **WHEN** the user reuses an image candidate
- **THEN** the system SHALL NOT call Creative Brief, image, video, approval, billing, or provider APIs

#### Scenario: Video candidate

- **WHEN** a candidate is a video
- **THEN** the reuse-as-reference actions SHALL not be offered

### Requirement: Manual reference change clears stale lineage

The system SHALL clear reuse lineage when the corresponding reference is manually replaced or removed.

#### Scenario: User uploads a new product reference

- **GIVEN** product reuse lineage exists
- **WHEN** the user uploads or removes the product reference
- **THEN** the product reuse lineage SHALL become null
