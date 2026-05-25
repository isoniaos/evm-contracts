import { expect } from "chai";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDemoLocalContractAddresses } from "../scripts/demo-local-addresses.js";

const CHAIN_ID = 31337;
const GOV_CORE_ADDRESS = "0x1111111111111111111111111111111111111111";
const GOV_PROPOSALS_ADDRESS = "0x2222222222222222222222222222222222222222";
const DEMO_TARGET_ADDRESS = "0x3333333333333333333333333333333333333333";
const DEMO_VOTES_TOKEN_ADDRESS = "0x4444444444444444444444444444444444444444";

describe("demo-local address resolver", function () {
  const temporaryRoots: string[] = [];

  afterEach(function () {
    for (const temporaryRoot of temporaryRoots.splice(0)) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("uses all three explicit env addresses", function () {
    const addresses = resolveDemoLocalContractAddresses({
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

  it("includes an optional demo votes token env address when provided", function () {
    const addresses = resolveDemoLocalContractAddresses({
      chainId: CHAIN_ID,
      env: {
        GOV_CORE_ADDRESS,
        GOV_PROPOSALS_ADDRESS,
        DEMO_TARGET_ADDRESS,
        DEMO_VOTES_TOKEN_ADDRESS,
      },
      projectRoot: createTemporaryProjectRoot(),
    });

    expect(addresses).to.deep.equal({
      govCore: GOV_CORE_ADDRESS,
      govProposals: GOV_PROPOSALS_ADDRESS,
      demoTarget: DEMO_TARGET_ADDRESS,
      demoVotesToken: DEMO_VOTES_TOKEN_ADDRESS,
      source: "env",
    });
  });

  it("rejects partial explicit env addresses", function () {
    const resolve = () =>
      resolveDemoLocalContractAddresses({
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

    const addresses = resolveDemoLocalContractAddresses({
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

  it("includes the optional demo votes token when the Ignition deployment has one", function () {
    const projectRoot = createTemporaryProjectRoot();
    const deploymentFile = writeIgnitionDeployment(projectRoot, CHAIN_ID, true);

    const addresses = resolveDemoLocalContractAddresses({
      chainId: CHAIN_ID,
      env: {},
      projectRoot,
    });

    expect(addresses).to.deep.equal({
      govCore: GOV_CORE_ADDRESS,
      govProposals: GOV_PROPOSALS_ADDRESS,
      demoTarget: DEMO_TARGET_ADDRESS,
      demoVotesToken: DEMO_VOTES_TOKEN_ADDRESS,
      source: "ignition",
      ignitionDeploymentFile: deploymentFile,
    });
  });

  it("fails clearly when env and Ignition deployed addresses are unavailable", function () {
    const projectRoot = createTemporaryProjectRoot();

    const resolve = () =>
      resolveDemoLocalContractAddresses({
        chainId: CHAIN_ID,
        env: {},
        projectRoot,
      });

    expect(resolve).to.throw("Run `corepack pnpm deploy:demo:local` first");
    expect(resolve).to.throw("corepack pnpm seed:demo:local");
  });

  it("rejects core-only Ignition deployments for demo seeding", function () {
    const projectRoot = createTemporaryProjectRoot();
    writeCoreIgnitionDeployment(projectRoot, CHAIN_ID);

    const resolve = () =>
      resolveDemoLocalContractAddresses({
        chainId: CHAIN_ID,
        env: {},
        projectRoot,
      });

    expect(resolve).to.throw("IsoniaDemoLocalModule#GovCore");
    expect(resolve).to.throw("IsoniaDemoLocalModule#GovProposals");
    expect(resolve).to.throw("IsoniaDemoLocalModule#DemoTarget");
    expect(resolve).to.throw("corepack pnpm deploy:demo:local");
  });

  it("does not expose a deploy-new-contracts fallback", function () {
    const projectRoot = createTemporaryProjectRoot();
    writeIgnitionDeployment(projectRoot, CHAIN_ID);

    const addresses = resolveDemoLocalContractAddresses({
      chainId: CHAIN_ID,
      env: {},
      projectRoot,
    });

    expect(addresses.source).to.equal("ignition");
  });

  function createTemporaryProjectRoot(): string {
    const temporaryRoot = mkdtempSync(join(process.cwd(), ".tmp-demo-local-address-resolver-"));
    temporaryRoots.push(temporaryRoot);
    return temporaryRoot;
  }
});

function writeCoreIgnitionDeployment(projectRoot: string, chainId: number): string {
  const deploymentDirectory = join(projectRoot, "ignition", "deployments", `chain-${chainId}`);
  const deploymentFile = join(deploymentDirectory, "deployed_addresses.json");

  mkdirSync(deploymentDirectory, { recursive: true });
  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        "IsoniaProtocolCoreModule#GovCore": GOV_CORE_ADDRESS,
        "IsoniaProtocolCoreModule#GovProposals": GOV_PROPOSALS_ADDRESS,
      },
      null,
      2,
    ),
  );

  return deploymentFile;
}

function writeIgnitionDeployment(projectRoot: string, chainId: number, includeDemoVotesToken = false): string {
  const deploymentDirectory = join(projectRoot, "ignition", "deployments", `chain-${chainId}`);
  const deploymentFile = join(deploymentDirectory, "deployed_addresses.json");

  mkdirSync(deploymentDirectory, { recursive: true });
  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        "IsoniaDemoLocalModule#DemoTarget": DEMO_TARGET_ADDRESS,
        "IsoniaDemoLocalModule#GovCore": GOV_CORE_ADDRESS,
        "IsoniaDemoLocalModule#GovProposals": GOV_PROPOSALS_ADDRESS,
        ...(includeDemoVotesToken ? { "IsoniaDemoLocalModule#IsoDemoVotesToken": DEMO_VOTES_TOKEN_ADDRESS } : {}),
      },
      null,
      2,
    ),
  );

  return deploymentFile;
}
