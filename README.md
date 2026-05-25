# IsoniaOS EVM Contracts

This repository owns the EVM smart contracts for modeled IsoniaOS governance authority. It contains the Solidity protocol contracts, local deployment scripts, seed tooling, and tests used by downstream Control Plane, SDK, and App Core work.

The public developer overview is in the public docs repository at [site/developers/index.md](https://github.com/isoniaos/docs/blob/main/site/developers/index.md). Local authority boundaries and contract surface notes are maintained in [`docs/protocol-boundaries.md`](docs/protocol-boundaries.md).

## Installation

Requires Node.js 22 or newer and pnpm through Corepack.

```bash
corepack pnpm install
```

The repository also includes [`foundry.toml`](foundry.toml) for optional Foundry-based Solidity tests when Foundry is installed locally.

## Configuration

Hardhat configuration lives in [`hardhat.config.ts`](hardhat.config.ts).

Current networks and variables:

- `hardhatMainnet`: local EDR L1 simulation used by the local node script.
- `hardhatOp`: local EDR OP simulation.
- `localhost`: HTTP JSON-RPC at `http://127.0.0.1:8545`.
- `sepolia`: requires `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` through Hardhat configuration variables.

Local node script variables:

- `HARDHAT_NODE_NETWORK`: defaults to `hardhatMainnet`.
- `HARDHAT_NODE_HOST`: defaults to `127.0.0.1`.
- `HARDHAT_NODE_PORT`: defaults to `8545`.
- `HARDHAT_VERBOSE_LOGS=true`: preserves verbose Hardhat request logging.

Demo-local seed explicit-address mode uses all of these together:

- `GOV_CORE_ADDRESS`
- `GOV_PROPOSALS_ADDRESS`
- `DEMO_TARGET_ADDRESS`

`DEMO_VOTES_TOKEN_ADDRESS` is optional for explicit-address demo seed runs.

## Run / Usage

Run contract tests:

```bash
corepack pnpm test
```

Start a local Hardhat node:

```bash
corepack pnpm node:local
```

Deploy only the protocol core contracts to the running local node:

```bash
corepack pnpm deploy:core:local
```

Deploy protocol core plus demo/local helper contracts to the running local node:

```bash
corepack pnpm deploy:demo:local
```

Seed local organizations and demo actions against the demo-local deployment:

```bash
corepack pnpm seed:demo:local
```

Optional Foundry validation, when Foundry is installed:

```bash
forge test
```

## Troubleshooting

- If `seed:demo:local` cannot find deployment addresses, run `corepack pnpm deploy:demo:local` first or set `GOV_CORE_ADDRESS`, `GOV_PROPOSALS_ADDRESS`, and `DEMO_TARGET_ADDRESS` together.
- If browser wallet transactions fail on the local chain, confirm the wallet is connected to chain `31337` and has local ETH.
- If Hardhat node output is too noisy, leave `HARDHAT_VERBOSE_LOGS` unset. Set it to `true` only while debugging RPC/EVM behavior.
- If Sepolia commands fail before execution, confirm Hardhat can resolve `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`.

## Contribution

Read [`AGENTS.md`](AGENTS.md) before editing. Contract behavior changes must preserve explicit authority boundaries, `orgId` isolation, policy/version semantics, and replayable event surfaces. Keep demo contracts, mocks, fixtures, and provider experiments isolated from protocol core.

Update the smallest relevant local docs and the public docs repository when a change affects user, developer, operator, configuration, or public-claim behavior.

## License

MIT. See [`LICENSE`](LICENSE).
