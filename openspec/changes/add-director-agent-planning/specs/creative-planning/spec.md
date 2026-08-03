# Creative planning

## ADDED Requirements

### Requirement: Live Creative Brief planning is independent from paid media

The system SHALL expose a live Creative Brief feature that can be enabled independently from paid image and video generation.

#### Scenario: Text planning enabled while paid media is disabled

- **GIVEN** account authentication and the text provider are ready
- **AND** live Creative Brief planning is enabled
- **AND** paid media generation is disabled
- **WHEN** an authenticated user submits grounded product facts
- **THEN** the system SHALL request a provider-backed Creative Brief
- **AND** SHALL NOT require Stripe, a subscription, or media-ledger readiness

#### Scenario: Live planning is unavailable

- **GIVEN** live Creative Brief planning is disabled or unready
- **WHEN** an authenticated user submits product facts
- **THEN** the system SHALL return the deterministic fallback brief
- **AND** SHALL disclose that the provider is `fallback`

### Requirement: Creative Brief provenance survives recovery

The system SHALL store Creative Brief provenance in the campaign snapshot and SHALL preserve it through local storage, cloud recovery, and export/import.

#### Scenario: Legacy campaign snapshot

- **GIVEN** a valid campaign snapshot created before provenance was introduced
- **WHEN** the snapshot is loaded
- **THEN** it SHALL remain valid
- **AND** its provenance SHALL default to unknown

### Requirement: Reference imagery is not misrepresented

The Routes surface SHALL identify fixed persona photography as illustrative casting reference imagery and SHALL NOT imply that it was generated for the current campaign.

#### Scenario: Fixed persona photography is shown

- **WHEN** the Routes surface displays built-in persona photography
- **THEN** it SHALL label the photography as illustrative casting reference imagery
- **AND** SHALL NOT attribute it to the current campaign or a live generation provider
