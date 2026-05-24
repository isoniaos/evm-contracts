# IsoniaOS EVM Contracts Agent Rules

These rules apply to Codex and other AI agents working in `evm-contracts`.

When this repository is used inside the IsoniaOS workspace, read the workspace-level `../AGENTS.md` first, then return to this file for repository-specific instructions.

## Repository Purpose

`evm-contracts` is the source of onchain protocol authority for modeled IsoniaOS governance state.

Contracts define the authoritative state for organizations, bodies, roles, mandates, policy rules, proposal lifecycle, approvals, vetoes, timelocks, queue state, and execution state.

Control Plane, SDK, App Core, external tools, manual accountability records, and templates must not be treated as protocol authority.

## Active Target

Current active target: v0.8 accountability and integration-preview wave.

The contract core should be production-shaped and generic. Do not build demo-specific, customer-specific, provider-experiment, or presentation-harness logic into audited/protocol core.

## Boundaries

Do:

- keep protocol behavior explicit and first-party;
- preserve `orgId` isolation;
- keep policy snapshot/version semantics intact;
- keep demo contracts, mocks, fixtures, and local proof targets isolated from the protocol core;
- treat demo target events as local proof only, not proof that external work completed;
- keep package versions, dependency refs, and changelog entries consistent when a release task is scoped;
- update `CHANGELOG.md` under `Unreleased` for user-visible contract changes.

Do not:

- implement ISO launch tokenomics unless explicitly scoped;
- treat demo or provider-compatibility voting tokens as ISO launch tokenomics or production governance eligibility;
- hardcode Snapshot, Safe, Tally, Agora, Sepolia lab fixtures, customer ABIs, or presentation records into the protocol core;
- add SaaS-only behavior;
- create Git tags automatically;
- introduce production, audit, public beta, legal, provider-completeness, or ISO launch-readiness claims.

## Late-v0.8 Hardening Backlog

When explicitly scoped, late-v0.8 contract hardening should include:

- `Gov` to `Iso` naming cleanup where code should represent the current protocol vocabulary;
- demo and mocks isolation review;
- NatSpec coverage;
- Solidity function ordering cleanup;
- test coverage review;
- gas reports;
- removal of version names from Ignition modules and scripts where code should represent current state;
- security/audit-readiness review with focus on authority, execution, access control, tenant isolation, and integration trust boundaries.

Do not mix this hardening wave into unrelated feature work unless the task explicitly asks for it.

## Verification

For contract behavior changes, run the strongest relevant subset:

- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`
- `git diff --check`

For AGENTS-only or documentation-only changes, `git diff --check` is sufficient unless local instructions require more.
