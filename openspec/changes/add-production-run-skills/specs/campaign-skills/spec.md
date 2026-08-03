# Campaign Skills

## ADDED Requirements

### Requirement: Campaign Skill is durable campaign state

The system SHALL persist exactly one supported Campaign Skill for each campaign.

#### Scenario: New campaign

- **WHEN** a new campaign is created
- **THEN** its skill SHALL default to Product Review

#### Scenario: Legacy campaign

- **GIVEN** a valid snapshot without a skill field
- **WHEN** the snapshot is loaded
- **THEN** its skill SHALL default to Product Review

#### Scenario: Unknown skill

- **WHEN** a snapshot contains an unsupported skill identifier
- **THEN** campaign validation SHALL fail

### Requirement: Campaign Skill shapes grounded planning

The selected Campaign Skill SHALL shape live and fallback Creative Brief direction without adding product facts.

#### Scenario: Skill-aware brief request

- **WHEN** a user submits Product Sources
- **THEN** the request SHALL include the selected Campaign Skill
- **AND** the generated or fallback brief SHALL use its planning posture
- **AND** product truth SHALL remain limited to supplied facts

### Requirement: Supported skill set remains bounded

The initial skill set SHALL contain Product Review, Problem to Demo, Founder Story, and Faceless Explainer.

#### Scenario: Skill selection

- **WHEN** a user opens Product Sources
- **THEN** the user SHALL be able to choose exactly one of the four supported skills
- **AND** the selection SHALL not invoke a provider
