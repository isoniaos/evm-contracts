import { expect } from "chai";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSeedContractAddresses } from "../scripts/seed-local-addresses.js";

const CHAIN_ID = 31337;
const GOV_CORE_ADDRESS = "0x1111111111111111111111111111111111111111";
const GOV_PROPOSALS_ADDRESS = "0x2222222222222222222222222222222222222222";
const DEMO_TARGET_ADDRESS = "0x3333333333333333333333333333333333333333";

describe("seed-local address resolver", function () {
  const temporaryRoots: string[] = [];

  afterEach(function () {
    for (const temporaryRoot of temporaryRoots.splice(0)) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("uses all three explicit env addresses", function () {
    const addresses = resolveSeedContractAddresses({
      chainId: CHAIN_ID,
      env: {
        GOV_CORE_ADDRESS,
        GOV_PROPOSALS_ADDRESS,
        DEMO_TARGET_ADDRESS,
      },
      projectRoot: createTemporaryProjectRoot(),
    });

    expect(addresses).to.deep.equal({
      govCore: GOV_CORE_ADDRESS,
      govProposals: GOV_PROPOSALS_ADDRESS,
      demoTarget: DEMO_TARGET_ADDRESS,
      source: "env",
    });
  });

  it("rejects partial explicit env addresses", function () {
    const resolve = () =>
      resolveSeedContractAddresses({
        chainId: CHAIN_ID,
        env: {
          GOV_CORE_ADDRESS,
          GOV_PROPOSALS_ADDRESS,
        },
        projectRoot: createTemporaryProjectRoot(),
      });

    expect(resolve).to.throw("Set all of GOV_CORE_ADDRESS, GOV_PROPOSALS_ADDRESS, DEMO_TARGET_ADDRESS");
    expect(resolve).to.throw("Missing: DEMO_TARGET_ADDRESS");
  });

  it("uses local Ignition deployed addresses when env addresses are unset", function () {
    const projectRoot = createTemporaryProjectRoot();
    const deploymentFile = writeIgnitionDeployment(projectRoot, CHAIN_ID);

    const addresses = resolveSeedContractAddresses({
      chainId: CHAIN_ID,
      env: {},
      projectRoot,
    });

    expect(addresses).to.deep.equal({
      govCore: GOV_CORE_ADDRESS,
      govProposals: GOV_PROPOSALS_ADDRESS,
      demoTarget: DEMO_TARGET_ADDRESS,
      source: "ignition",
      ignitionDeploymentFile: deploymentFile,
    });
  });

  it("fails clearly when env and Ignition deployed addresses are unavailable", function () {
    const projectRoot = createTemporaryProjectRoot();

    const resolve = () =>
      resolveSeedContractAddresses({
        chainId: CHAIN_ID,
        env: {},
        projectRoot,
      });

    expect(resolve).to.throw("Run `corepack pnpm deploy:local` first");
    expect(resolve).to.throw("corepack pnpm seed:local");
  });

  it("does not expose a deploy-new-contracts fallback", function () {
    const projectRoot = createTemporaryProjectRoot();
    writeIgnitionDeployment(projectRoot, CHAIN_ID);

    const addresses = resolveSeedContractAddresses({
      chainId: CHAIN_ID,
      env: {},
      projectRoot,
    });

    expect(addresses.source).to.equal("ignition");
  });

  function createTemporaryProjectRoot(): string {
    const temporaryRoot = mkdtempSync(join(process.cwd(), ".tmp-seed-local-resolver-"));
    temporaryRoots.push(temporaryRoot);
    return temporaryRoot;
  }
});

function writeIgnitionDeployment(projectRoot: string, chainId: number): string {
  const deploymentDirectory = join(projectRoot, "ignition", "deployments", `chain-${chainId}`);
  const deploymentFile = join(deploymentDirectory, "deployed_addresses.json");

  mkdirSync(deploymentDirectory, { recursive: true });
  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        "IsoniaProtocolV01Module#DemoTarget": DEMO_TARGET_ADDRESS,
        "IsoniaProtocolV01Module#GovCore": GOV_CORE_ADDRESS,
        "IsoniaProtocolV01Module#GovProposals": GOV_PROPOSALS_ADDRESS,
      },
      null,
      2,
    ),
  );

  return deploymentFile;
}
