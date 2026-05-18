# IsoniaOS EVM Contracts

EVM smart contracts for the IsoniaOS governance architecture protocol.

## Status

Active development target: v0.8 alpha accountability and integration-preview contract wave on top of the v0.7 protocol hardening foundation.

## Scope

- shared multi-organization governance protocol
- organizations
- bodies
- roles
- mandates
- policy rules
- proposal lifecycle
- organization-scoped execution target and selector registry
- deterministic local proof-of-execution events for demo accountability flows

## Protocol Notes

### v0.8 Execution Target Registry

v0.8 adds an organization-scoped execution target/selector registry so proposal execution is no longer hardcoded to the local `DemoTarget`. Proposal execution authority is derived from IsoniaOS governance contracts and configured execution permissions.

Proposals now carry a compact protocol-level action identity: `target`, `value`, `actionSelector`, and `dataHash`. The selector is not ABI decoding and does not make arbitrary target-contract events governance authority. It lets IsoniaOS explain which registered selector a proposal intends to execute before full calldata is supplied.

`GovProposals` requires:

- the proposal target to be explicitly enabled for the organization;
- the proposal action selector to be explicitly enabled for that organization and target;
- execution calldata to have the same selector declared by the proposal;
- the proposal value and execution `msg.value` to stay within the target rule's `maxValue`;
- normal function-call execution calldata to contain at least a 4-byte selector.

Execution still enforces proposal status, approvals, vetoes, timelocks, executor role, exact full-calldata `dataHash`, and exact `msg.value`. Full calldata remains supplied at execution time and must hash to the proposal's stored `dataHash`. Registry updates emit `ExecutionTargetRuleUpdated` and `ExecutionSelectorRuleUpdated`, while `ProposalCreated` includes `actionSelector`, so downstream indexers can observe proposal intent and governance execution permissions without decoding arbitrary target-contract events.

Target contract behavior and events are execution evidence only. They are not universal governance authority and do not prove that external work, manual evidence, or offchain integrations are complete.

### v0.8 Local/Lab Demo Target

`DemoTarget` remains available as a local/lab target that must be explicitly enabled for demo organizations. It is not built-in governance authority, not a production treasury, and not an external integration authority.

The v0.8 demo target preserves the existing `setNumber(uint64 orgId, uint256 newNumber)` path and adds governed actions for local accountability scenarios:

- `setFeatureEnabled(uint64 orgId, bytes32 feature, bool enabled)`
- `setUintParam(uint64 orgId, bytes32 key, uint256 value)`
- `releaseNativePayment(uint64 orgId, bytes32 obligationId, address payable recipient)`
- `markObligationAccepted(uint64 orgId, bytes32 obligationId)`
- `markObligationCancelled(uint64 orgId, bytes32 obligationId, string reason)`

These methods emit deterministic local/lab events that downstream read models can later map into proposal history, execution state, obligation references, linked transaction hashes, and public proof-of-execution displays. The local seed script explicitly enables the `DemoTarget` address and selectors for seeded demo organizations before creating executable demo proposals.

### Demo Votes Token

`IsoDemoVotesToken` is a demo-only ERC20Votes-style token deployed by the local Ignition module for future local DAO-process simulation. It supports owner-only demo minting, delegation, current votes, and historical votes.

This token is not the ISO launch token and does not implement bonding curves, fees, transfer taxes, reserves, identity checks, whale premiums, governance activation, or production voting eligibility.

### Bootstrap Finalization and Admin Handoff

The v0.7 alpha protocol includes explicit bootstrap finalization. The organization admin can complete setup, review the activated structure, and call `finalizeOrganization(orgId)` to end bootstrap authority for governance-critical configuration.

Finalization is irreversible in this alpha and emits `OrganizationFinalized`. `isOrganizationFinalized(orgId)` exposes the on-chain finalization state while existing read paths remain available.

After finalization, bootstrap admin mutation functions are blocked for bodies, roles, mandates, policy rules, typed batch activation, and the existing admin-only configuration/update paths. Future emergency/recovery and governance-controlled post-finalization configuration changes remain open design areas and are not implemented here.

### Admin Batch Activation

The v0.7 alpha protocol also includes typed admin batch functions for bootstrap setup groups:

- `batchCreateBodies`
- `batchCreateRoles`
- `batchAssignMandates`
- `batchSetPolicyRules`

Batches preserve `msg.sender` as the organization admin, avoid arbitrary calldata multicall, and emit the same granular events as the equivalent serial setup calls so Control Plane read models remain deterministically recoverable from contract events. Serial activation remains supported as the compatibility fallback.

Batch activation reduces setup friction, while bootstrap finalization prevents bootstrap authority from becoming permanent admin control after governance activation. App Core should prefer a contract batch path when available, keep serial activation as fallback, and treat EIP-5792 as an optional wallet-level optimization because support is wallet, account, and chain dependent.

These alpha contracts are not production audited and should not be described as production-ready governance infrastructure.

## Local Developer Preview Deployment

Start a local Hardhat node:

```txt
corepack pnpm node:local
```

The `node:local` script starts the Hardhat 3 local node with the configured
`hardhatMainnet` simulated network. Hardhat's node task enables request logging
for the JSON-RPC server, so normal mode turns that request logging back off
after startup. Wallet/provider simulation reverts do not dominate demo output.
Set `HARDHAT_VERBOSE_LOGS=true` before starting the node to preserve verbose
Hardhat request logs while debugging RPC or EVM failures. This setting changes
only local node console logging; it does not change contract behavior or relax
transaction/call failure semantics.

Deploy local demo contracts with Ignition:

```txt
corepack pnpm deploy:local
```

The local demo module deploys `GovCore`, `GovProposals`, `DemoTarget`, and `IsoDemoVotesToken`. `DemoTarget` execution is not hardcoded in `GovProposals`; `seed:local` configures it as an explicit local/lab execution target for the seeded organizations.

A protocol-only Ignition module is also available at `ignition/modules/IsoniaProtocol.ts` for future deployment paths that need only `GovCore` and `GovProposals`.

Seed the Simple DAO+ and Bicameral preview topologies:

```txt
corepack pnpm seed:local
```

`seed:local` reads the current chain's Ignition deployment file, such as `ignition/deployments/chain-31337/deployed_addresses.json`, and seeds those existing contracts. The `contracts` addresses printed by `seed:local` must match the Ignition deployed addresses.

The local v0.8 seed also creates one approved-and-executed accountability demo action and one approved-but-not-executed obligation action. If the Ignition deployment includes `IsoDemoVotesToken`, `seed:local` mints demo votes to deterministic sample actors and self-delegates them for local simulation.

Future Sepolia lab deployments should be represented by deployment manifests that record explicit chain IDs, protocol addresses, deployment capabilities, and configured execution target/selector permissions. Runtime behavior must not be inferred from package version strings.

Optional explicit address mode is available when seeding a known contract set directly.

PowerShell:

```txt
$env:GOV_CORE_ADDRESS = "0x..."
$env:GOV_PROPOSALS_ADDRESS = "0x..."
$env:DEMO_TARGET_ADDRESS = "0x..."
corepack pnpm seed:local
```

cmd.exe:

```txt
set GOV_CORE_ADDRESS=0x...
set GOV_PROPOSALS_ADDRESS=0x...
set DEMO_TARGET_ADDRESS=0x...
corepack pnpm seed:local
```

All three explicit address variables must be set together. If no explicit addresses are set and no Ignition deployment file exists for the current chain, run `corepack pnpm deploy:local` first.

`DEMO_VOTES_TOKEN_ADDRESS` may also be provided when explicit address mode is used, but it is optional and does not replace the required protocol addresses.

Set balance in your browser wallet:

```txt
npx hardhat console
> await fetch("http://127.0.0.1:8545", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "hardhat_setBalance",
    params: ["your_wallet_address", "0x56BC75E2D63100000"],
    id: 1
  })
});
```
