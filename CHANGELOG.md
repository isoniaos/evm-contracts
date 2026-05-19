# Changelog

All notable changes to `@isonia/evm-contracts` are documented here.

`package.json.version` uses SemVer without a leading `v`. Git tags use the matching version with a leading `v`, and GitHub dependency refs may point at those tags.

## [Unreleased]

## [0.8.0-alpha.4]

### Added

- Added optional org-scoped managed execution through `IsoOrgExecutor`, `IIsoOrgExecutor`, `GovProposals.setOrgExecutor`, `getOrgExecutor`, and `OrgExecutorUpdated`.
- Added managed execution tests proving final-target action identity, executor caller isolation, executor boundary rejections, final target selector/value enforcement, cross-org isolation, and setup/finalization restrictions.

### Changed

- Updated `GovProposals.executeProposal` to keep the existing direct final-target call path when no org executor is configured and to forward the same final target/value/selector/data hash through the configured org executor when present.
- Bumped package version to `0.8.0-alpha.4`.

## [0.8.0-alpha.3]

### Added

- Added selector-aware proposal action identity: proposals now store and emit `actionSelector` alongside `target`, `value`, and `dataHash`.
- Added `ActionSelectorMismatch(bytes4 expectedSelector, bytes4 actualSelector)` for execution calldata whose selector differs from the proposal-declared selector.

### Changed

- Updated `createProposal` and `ProposalCreated` to carry `actionSelector`; execution still verifies full calldata against `dataHash` and registry selector rules.
- Updated local seed paths to pass explicit `DemoTarget` selectors for demo/lab proposal actions.
- Bumped package version to `0.8.0-alpha.3`.

## [0.8.0-alpha.2]

### Added

- Added organization-scoped execution target and selector registry rules to `GovProposals`, including deterministic registry update events for indexing.
- Added a protocol-only Ignition module that deploys `GovCore` and `GovProposals` without local demo contracts.
- Added tests for explicit execution target/selector configuration, unconfigured target rejection, unconfigured selector rejection, short calldata rejection, value limits, data hash enforcement, executor/timelock behavior, and post-finalization registry immutability.

### Changed

- Removed the constructor-level `demoTarget` execution authority from `GovProposals`; local demo execution now requires explicit seeded target and selector rules.
- Updated local seeding to configure `DemoTarget` as a local/lab execution target for seeded demo organizations before creating executable demo proposals.
- Bumped package version to `0.8.0-alpha.2`.

## [0.8.0-alpha.1]

### Added

- Extended `DemoTarget` with v0.8 governed accountability actions and events for feature flags, uint parameters, native payment release, obligation acceptance, and obligation cancellation.
- Added demo-only `IsoDemoVotesToken` with ERC20Votes-style delegation and historical voting power for local DAO-process simulation.
- Added tests for v0.8 target caller guards, proposal-executed proof events, native value release, zero-recipient rejection, and demo votes delegation history.

### Changed

- Updated the Ignition deployment module to deploy and return the demo votes token alongside the existing protocol contracts.
- Updated local seeding to include an executed v0.8 accountability action, an approved-but-not-executed obligation action, and optional demo votes token mint/delegation output.
- Bumped package version to `0.8.0-alpha.1`.

## [0.7.0-alpha.6]

### Changed

- Added a canonical `node:local` script that starts the Hardhat local node with
  the configured `hardhatMainnet` simulated network selected explicitly.
- Disabled Hardhat node request logging after startup in normal local mode,
  while preserving `HARDHAT_VERBOSE_LOGS=true` as the verbose debugging path.

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

[Unreleased]: https://github.com/isoniaos/evm-contracts/compare/v0.8.0-alpha.4...HEAD
[0.8.0-alpha.4]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.8.0-alpha.4
[0.8.0-alpha.3]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.8.0-alpha.3
[0.8.0-alpha.2]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.8.0-alpha.2
[0.8.0-alpha.1]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.8.0-alpha.1
[0.7.0-alpha.6]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.6
[0.7.0-alpha.5]: https://github.com/isoniaos/evm-contracts/releases/tag/v0.7.0-alpha.5
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
