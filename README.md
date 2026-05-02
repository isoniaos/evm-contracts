# IsoniaOS EVM Contracts

EVM smart contracts for the IsoniaOS governance architecture protocol.

## Status

v0.5 Developer Preview / not audited / not production ready.

## Scope

- shared multi-organization governance protocol
- organizations
- bodies
- roles
- mandates
- policy rules
- proposal lifecycle

## Safety

Not audited. Do not use in production.

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
