# IsoniaOS EVM Contracts Agent Instructions

## Scope

This repository owns the Solidity protocol contracts, local deployment scripts, seed tooling, and tests for modeled IsoniaOS governance authority.

It does not own ISO token contracts, Control Plane projections, SDK clients, App Core UI, SaaS behavior, provider experiments, or public documentation site content.

## Workspace Instruction Chain

When working inside the private IsoniaOS workspace, read:

1. `../AGENTS.md`
2. `../CURRENT_ROADMAP.md`
3. relevant `../private-docs/` index, governance, roadmap, and migration docs
4. this repository `AGENTS.md`
5. this repository `/docs` and `README.md`
6. current source/config files before editing

If this repository is cloned standalone, use this file as the local agent entry point and avoid relying on private workspace-only paths.

## Stack and Commands

- Solidity contracts under `contracts/`
- Hardhat 3 with TypeScript config in `hardhat.config.ts`
- Core and demo-local Ignition deployment modules under `ignition/modules/`
- Optional Foundry configuration in `foundry.toml`

Useful commands:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm node:local
corepack pnpm deploy:core:local
corepack pnpm deploy:demo:local
corepack pnpm seed:demo:local
forge test
git diff --check
```

`forge test` applies only when Foundry is installed.

## Development Principles

- Keep protocol behavior explicit, generic, and first-party.
- Preserve `orgId` isolation, policy snapshot/version semantics, proposal lifecycle semantics, and execution checks.
- Treat contracts as authoritative only for the state they model.
- Keep demo contracts, mocks, fixtures, local proof targets, and presentation harnesses isolated from protocol core.
- Treat target-contract events and external records as evidence or context unless a protocol change explicitly models them as authority.
- Keep type safety, NatSpec clarity, and migration safety proportional to the behavior being changed.
- Do not implement ISO tokenomics or launch-token behavior here.
- Do not add SaaS-only behavior or provider-specific assumptions to protocol core.
- Do not make production, audit, public beta, legal, provider-completeness, grant, ISO launch, or token launch readiness claims without a scoped evidence gate.

## Documentation Rules

Update [`README.md`](README.md), [`docs/`](docs/), and `CHANGELOG.md` under `Unreleased` when contract behavior, deployment commands, configuration, event surfaces, or authority boundaries change.

Update the public docs repository when changes affect public developers, operators, users, or public claims. Use the smallest relevant public page and avoid duplicating private strategy.

## Testing and Validation

For contract behavior changes, run the strongest relevant subset:

```bash
corepack pnpm test
forge test
git diff --check
```

For documentation-only changes, `git diff --check` is normally sufficient. Run contract tests when the documentation edits reveal a behavior or command mismatch that needs verification.
