# Changelog

All notable changes to `@isonia/evm-contracts` are documented here.

`package.json.version` uses SemVer without a leading `v`. Git tags use the matching version with a leading `v`, and GitHub dependency refs may point at those tags.

## [Unreleased]

## [0.7.0-alpha.5]

### Changed

- Made local Hardhat node request logging quiet by default, with `HARDHAT_VERBOSE_LOGS=true` available for debugging.

## [0.7.0-alpha.4]

### Changed

- Fixed seed address resolution.

## [0.7.0-alpha.3]

### Changed

- Removed historical deploy and seed script aliases in favor of the canonical `deploy:local` and `seed:local` commands.

## [0.7.0-alpha.2]

### Added

- Added bootstrap finalization state, event, and read support for organizations.

### Changed

- Bootstrap admin mutation functions now require organizations to be not finalized, including existing admin-only body and role updates, mandate revocation, organization status changes, and admin-only proposal cancellation paths.

## [0.7.0-alpha.1]

### Added

- Added typed admin batch activation functions for bootstrap setup actions while preserving granular activation events.

### Changed

- Standardized simple `GovCore` and `DemoTarget` entry-point guards as Solidity modifiers.

## [0.6.0-alpha.4]

### Added

- Added a docs-only future protocol backlog note for bootstrap finalization, admin handoff, and typed admin batch activation.

## [0.6.0-alpha.3]

### Changed

- Documentation updated.
- Package version aligned to `0.6.0-alpha.3` for the v0.6 local demo stack.
- Node engine baseline updated to `>=22`.
- Prepared repository context for v0.6 alpha work after the closed v0.5 compatibility set.

## [0.6.0-alpha.2]

### Changed

- Metadata-only v0.6 package alignment for the local demo stack.
- No protocol or contract behavior changes.

## [0.5.0-alpha.3]

### Added

- Added developer-preview deploy and seed script aliases for v0.5 local setup docs.

### Changed

- Refreshed README language around the v0.5 Developer Preview scope.

## [0.5.0-alpha.2]

### Changed

- Aligned package metadata with the v0.5 alpha workspace.

## [0.1.0]

### Added

- Initial shared multi-organization governance protocol contracts.
- Organization, body, role, mandate, policy rule, and proposal lifecycle support.
- Demo target and local deployment/seed scripts for v0.1 validation.

[Unreleased]: https://github.com/isoniaos/evm-contracts/compare/v0.7.0-alpha.5...HEAD
[0.7.0-alpha.5]: https://github.com/isoniaos/evm-contracts/compare/v0.7.0-alpha.4...v0.7.0-alpha.5
[0.7.0-alpha.4]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.4
[0.7.0-alpha.3]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.3
[0.7.0-alpha.2]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.2
[0.7.0-alpha.1]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.1
[0.6.0-alpha.4]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.6.0-alpha.4
[0.6.0-alpha.3]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.6.0-alpha.3
[0.6.0-alpha.2]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.6.0-alpha.2
[0.5.0-alpha.3]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.5.0-alpha.3
[0.5.0-alpha.2]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.5.0-alpha.2
[0.1.0]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.1.0
