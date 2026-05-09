# IsoniaOS EVM Contracts

EVM smart contracts for the IsoniaOS governance architecture protocol.

## Status

Active development target: v0.6 alpha local demo baseline.

This is a metadata-only alignment for the local demo stack. It does not
change protocol behavior.

## Scope

- shared multi-organization governance protocol
- organizations
- bodies
- roles
- mandates
- policy rules
- proposal lifecycle

## Future Protocol Backlog

### Bootstrap Finalization and Admin Handoff

The v0.6 alpha contracts use the organization admin as bootstrap authority. A future protocol upgrade should add explicit bootstrap finalization so the admin can complete setup and then lose unilateral power over roles, mandates, and policy rules.

After finalization, mandate and policy changes should move through governance-controlled proposals and routes, or through narrowly scoped role authority such as `BodyAdmin` where the contract model grants it. Contracts remain authoritative for governance power.

### Admin Batch Activation

A related future EVM contract upgrade should add typed admin batch functions for bootstrap setup groups. Batches should preserve `msg.sender` as the organization admin and should avoid arbitrary calldata multicall as the first production path.

Preferred shapes include batch create bodies, batch create roles, batch assign mandates, batch set policy rules, or a typed bootstrap activation bundle. Batch activation must emit the same events expected by the Control Plane indexer so read models remain deterministically recoverable from contract events.

These upgrades should be designed together: batch activation reduces setup friction, while bootstrap finalization prevents bootstrap authority from becoming permanent admin control after governance activation. App Core should prefer a contract batch path when available, keep serial activation as the reliable v0.6 default, and treat EIP-5792 as an optional wallet-level optimization because support is wallet, account, and chain dependent.

## Local Developer Preview Deployment

Start a local Hardhat node:

```txt
corepack pnpm hardhat node --hostname 127.0.0.1 --port 8545
```

Deploy protocol contracts with Ignition:

```txt
corepack pnpm deploy:developer-preview
```

Seed the Simple DAO+ and Bicameral preview topologies:

```txt
set GOV_CORE_ADDRESS=0x...
set GOV_PROPOSALS_ADDRESS=0x...
set DEMO_TARGET_ADDRESS=0x...
corepack pnpm seed:developer-preview
```

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
