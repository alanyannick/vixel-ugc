# Production Run

## ADDED Requirements

### Requirement: Production Run reflects canonical state

The system SHALL provide a Production Run view that projects the current route, execution state, jobs, candidates, and capability readiness.

#### Scenario: Planning-only deployment

- **GIVEN** paid generation is disabled
- **WHEN** the user opens Production Run
- **THEN** the view SHALL show that planning is ready or incomplete
- **AND** SHALL show generation as closed
- **AND** SHALL NOT show a fake generating state

#### Scenario: Candidate exists

- **WHEN** at least one candidate exists
- **THEN** the view SHALL show one dominant preview
- **AND** SHALL show real provider/model/status metadata when available

#### Scenario: Job is active

- **WHEN** a canonical job is queued or processing
- **THEN** Production Run SHALL display that real job status and progress when supplied

### Requirement: Production Run reuses existing paid actions

Production Run SHALL delegate generation and delivery actions to the existing reviewed handlers.

#### Scenario: User requests generation

- **WHEN** the user activates a paid generation action from Production Run
- **THEN** the existing exact-input review flow SHALL open
- **AND** no new direct provider submission path SHALL exist

### Requirement: Production Run avoids fabricated performance

The system SHALL NOT present invented views, likes, virality, progress, or provider success.

#### Scenario: Result metadata

- **WHEN** a candidate result is displayed
- **THEN** only stored provider, model, status, signature, timestamp, and receipt lineage MAY be shown
