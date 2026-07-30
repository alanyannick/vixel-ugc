## ADDED Requirements

### Requirement: Product-first public entry
The public entry SHALL explain the product in the first viewport with persistent
navigation, one dominant campaign composer, and visible Pricing, Log in, and
Join waitlist actions.

#### Scenario: First visit
- **WHEN** a visitor opens the product entry
- **THEN** the primary product promise and next action are visible without authentication

### Requirement: Safe public composer
The public composer MUST capture intent without starting paid work.

#### Scenario: Anonymous compose
- **WHEN** an unauthenticated visitor enters a product reference and campaign intent
- **THEN** the system carries that context into onboarding without invoking a paid provider

### Requirement: Discoverable format examples
The product entry SHALL present representative UGC formats below the primary
composer and allow a format to seed the onboarding intent.

#### Scenario: Select format
- **WHEN** a visitor selects a format example
- **THEN** the composer reflects the selected intent and keeps account onboarding as the next gate
