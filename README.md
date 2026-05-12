# IsoniaOS EVM Contracts

EVM smart contracts for the IsoniaOS governance architecture protocol.

## Status

Active development target: v0.7 alpha protocol hardening on top of the v0.6 alpha local demo baseline.

## Scope

- shared multi-organization governance protocol
- organizations
- bodies
- roles
- mandates
- policy rules
- proposal lifecycle

## Protocol Notes

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
