# Director agent

## ADDED Requirements

### Requirement: Director is a bounded proposal agent

The system SHALL provide one campaign-aware Director agent whose available tools can only propose an existing hook/persona pair or an existing Studio view.

#### Scenario: Agent recommends a creative route

- **GIVEN** an authenticated user has a valid Creative Brief
- **WHEN** the user asks the Director for guidance
- **THEN** the agent MAY recommend one hook and one persona from that brief
- **AND** the server SHALL reject identifiers not present in the submitted campaign
- **AND** the response SHALL include a concise rationale

#### Scenario: Agent cannot execute paid work

- **WHEN** the Director handles any user request
- **THEN** it SHALL NOT call image or video generation
- **AND** SHALL NOT create approvals, billing mutations, entitlements, ledger entries, or campaign writes

### Requirement: Recommendations require explicit application

Director recommendations SHALL NOT change campaign state until the user explicitly applies them.

#### Scenario: User reviews without applying

- **WHEN** a Director recommendation is displayed
- **AND** the user does not activate Apply
- **THEN** selected hook and persona SHALL remain unchanged

#### Scenario: User applies a recommendation

- **WHEN** the user activates Apply
- **THEN** the client SHALL update the validated hook/persona selections
- **AND** SHALL create one campaign receipt describing the applied recommendation

### Requirement: Director availability is honest

The system SHALL show Director agent availability independently from paid media availability.

#### Scenario: Provider call fails

- **WHEN** a live Director provider call fails
- **THEN** the endpoint SHALL return a retryable service error
- **AND** SHALL NOT present deterministic copy as an AI result
