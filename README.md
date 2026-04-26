# IsoniaOS EVM Contracts

EVM smart contracts for the IsoniaOS governance architecture protocol.

## Status

v0.1 prototype / not production ready.

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

## Local v0.1 Deployment

Start a local Hardhat node:

```txt
corepack pnpm hardhat node --hostname 127.0.0.1 --port 8545
```

Deploy protocol contracts with Ignition:

```txt
corepack pnpm deploy:local
```

Seed the Simple DAO+ and Bicameral preview topologies:

```txt
set GOV_CORE_ADDRESS=0x...
set GOV_PROPOSALS_ADDRESS=0x...
set DEMO_TARGET_ADDRESS=0x...
corepack pnpm seed:local
```
