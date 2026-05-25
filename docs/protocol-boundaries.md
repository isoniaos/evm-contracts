# Protocol Boundaries

This repository contains the contracts that model IsoniaOS onchain governance state. Downstream repositories may index, explain, present, or call these contracts, but they must not redefine protocol authority.

## Core Contract Surface

- `GovCore` owns organizations, bodies, roles, mandates, policy rules, bootstrap setup, batch activation, and organization finalization.
- `GovProposals` owns proposal lifecycle, route checks, approvals, vetoes, timelocks, execution permission checks, and canonical execution receipts.
- `GovTypes` and `GovErrors` hold shared protocol types and errors.
- `execution/IsoOrgExecutor.sol` is an optional protocol helper for organization-scoped managed execution handoff.
- Interfaces under `contracts/interfaces/` define narrow cross-contract boundaries.

## Execution Identity

Proposal action identity is modeled as:

- `target`
- `value`
- `actionSelector`
- `dataHash`

Execution validates the configured target, selector, value limit, calldata selector, full calldata hash, proposal status, approval/veto/timelock state, and executor authority before a call is made.

## Managed Execution

When an organization has an `IsoOrgExecutor` configured, `GovProposals` still validates the final target call before forwarding through that executor. `ProposalExecuted` is the canonical protocol execution receipt. `ManagedCallExecuted` is supporting executor-local evidence.

`IsoOrgExecutor` is scoped to one `orgId` and one `GovProposals` address. It is not a global operator, superadmin, proxy pattern, or arbitrary ABI adapter.

## Local and Lab Contracts

`demo/DemoTarget.sol` and `demo/IsoDemoVotesToken.sol` are local/demo helpers. They are not production treasury infrastructure, ISO token mechanics, provider integration proof, or general governance authority.

Target-contract events from local/demo contracts can support deterministic proof and UI testing, but they do not prove that external work was completed.

## Deployment Boundary

`ignition/modules/IsoniaProtocolCore.ts` deploys only the base protocol core (`GovCore` and `GovProposals`). `ignition/modules/IsoniaDemoLocal.ts` composes the demo target and demo votes token on top of the core contracts for local workflows.

Generated Ignition deployment state under `ignition/deployments/` is local output and should not be treated as source or committed as an active protocol artifact.

## Finalization and Batch Activation

Bootstrap finalization ends organization-admin mutation authority for modeled setup paths. Batch activation groups setup operations without arbitrary calldata multicall and should continue to emit granular events that Control Plane can replay.

Future emergency, recovery, governance-controlled post-finalization changes, provider adapters, parameter constraints, ABI upload/decoding, and central event hubs require separate scoped design and implementation.
