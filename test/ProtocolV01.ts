import { expect } from "chai";
import { network } from "hardhat";
import type { BaseContract } from "ethers";

const hardhatRuntime: Awaited<ReturnType<typeof network.create>> = await network.create();
const { ethers } = hardhatRuntime;
type EthersHelpers = typeof ethers;
type DeployedContract = BaseContract;
type SignerWithAddress = Awaited<ReturnType<EthersHelpers["getSigners"]>>[number];

const BODY_KIND = {
  generalCouncil: 1n,
  treasuryCommittee: 2n,
  securityCouncil: 3n,
} as const;

const ROLE_TYPE = {
  proposer: 3n,
  approver: 4n,
  vetoer: 5n,
  executor: 6n,
} as const;

const PROPOSAL_TYPE = {
  standard: 1n,
  treasury: 2n,
} as const;

const PROPOSAL_STATUS = {
  approved: 3n,
  queued: 4n,
  vetoed: 5n,
  executed: 6n,
} as const;

const ONE_HOUR = 3600n;

interface BodyContext {
  readonly councilBodyId: bigint;
  readonly treasuryBodyId: bigint;
  readonly securityBodyId: bigint;
}

interface OrgContext {
  readonly orgId: bigint;
  readonly bodies: BodyContext;
}

interface ProtocolContext {
  readonly govCore: DeployedContract;
  readonly govProposals: DeployedContract;
  readonly demoTarget: DeployedContract;
  readonly orgAdminA: SignerWithAddress;
  readonly orgAdminB: SignerWithAddress;
  readonly proposer: SignerWithAddress;
  readonly councilApprover: SignerWithAddress;
  readonly treasuryApprover: SignerWithAddress;
  readonly vetoer: SignerWithAddress;
  readonly executor: SignerWithAddress;
  readonly outsider: SignerWithAddress;
  readonly orgA: OrgContext;
  readonly orgB: OrgContext;
}

interface ProposalView {
  readonly status: bigint;
  readonly executableAt: bigint;
}

function singleBody(bodyId: bigint): bigint[] {
  return [bodyId];
}

function createAction(demoTarget: DeployedContract, orgId: bigint, number: bigint): { actionData: string; dataHash: string } {
  const actionData: string = demoTarget.interface.encodeFunctionData("setNumber", [orgId, number]);
  return { actionData, dataHash: ethers.keccak256(actionData) };
}

async function nextOrgId(govCore: DeployedContract): Promise<bigint> {
  return readBigInt(govCore, "nextOrgId");
}

async function nextBodyId(govCore: DeployedContract): Promise<bigint> {
  return readBigInt(govCore, "nextBodyId");
}

async function nextRoleId(govCore: DeployedContract): Promise<bigint> {
  return readBigInt(govCore, "nextRoleId");
}

async function nextProposalId(govProposals: DeployedContract): Promise<bigint> {
  return readBigInt(govProposals, "nextProposalId");
}

async function readBigInt(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<bigint> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as bigint;
}

async function invoke(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<void> {
  const method = contract.getFunction(methodName);
  await method(...args);
}

async function readProposal(govProposals: DeployedContract, proposalId: bigint): Promise<ProposalView> {
  const method = govProposals.getFunction("proposals");
  const proposal = await method(proposalId) as { status: bigint; executableAt: bigint };
  return { status: proposal.status, executableAt: proposal.executableAt };
}

async function createOrganization(govCore: DeployedContract, admin: SignerWithAddress, slug: string): Promise<bigint> {
  const orgId: bigint = await nextOrgId(govCore);
  await invoke(govCore, "createOrganization", [slug, `ipfs://${slug}`, admin.address]);
  return orgId;
}

async function createBody(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, kind: bigint, metadataUri: string): Promise<bigint> {
  const bodyId: bigint = await nextBodyId(govCore);
  await invoke(govCore.connect(admin), "createBody", [orgId, kind, metadataUri]);
  return bodyId;
}

async function createRole(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, bodyId: bigint, roleType: bigint, metadataUri: string): Promise<bigint> {
  const roleId: bigint = await nextRoleId(govCore);
  await invoke(govCore.connect(admin), "createRole", [orgId, bodyId, roleType, metadataUri]);
  return roleId;
}

async function assignMandate(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, roleId: bigint, holder: SignerWithAddress, proposalType: bigint): Promise<void> {
  const proposalTypeMask: bigint = 1n << proposalType;
  await invoke(govCore.connect(admin), "assignMandate", [orgId, roleId, holder.address, 0, 0, proposalTypeMask, 0]);
}

async function grantRole(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, bodyId: bigint, roleType: bigint, holder: SignerWithAddress, proposalType: bigint, metadataUri: string): Promise<void> {
  const roleId: bigint = await createRole(govCore, admin, orgId, bodyId, roleType, metadataUri);
  await assignMandate(govCore, admin, orgId, roleId, holder, proposalType);
}

async function createOrgContext(govCore: DeployedContract, admin: SignerWithAddress, slug: string): Promise<OrgContext> {
  const orgId: bigint = await createOrganization(govCore, admin, slug);
  const councilBodyId: bigint = await createBody(govCore, admin, orgId, BODY_KIND.generalCouncil, `ipfs://${slug}-council`);
  const treasuryBodyId: bigint = await createBody(govCore, admin, orgId, BODY_KIND.treasuryCommittee, `ipfs://${slug}-treasury`);
  const securityBodyId: bigint = await createBody(govCore, admin, orgId, BODY_KIND.securityCouncil, `ipfs://${slug}-security`);
  return { orgId, bodies: { councilBodyId, treasuryBodyId, securityBodyId } };
}

async function configurePolicies(govCore: DeployedContract, orgAdmin: SignerWithAddress, org: OrgContext): Promise<void> {
  await invoke(govCore.connect(orgAdmin), "setPolicyRule", [org.orgId, PROPOSAL_TYPE.standard, singleBody(org.bodies.councilBodyId), [], org.bodies.councilBodyId, 0, true]);
  await invoke(govCore.connect(orgAdmin), "setPolicyRule", [org.orgId, PROPOSAL_TYPE.treasury, [org.bodies.councilBodyId, org.bodies.treasuryBodyId], singleBody(org.bodies.securityBodyId), org.bodies.councilBodyId, ONE_HOUR, true]);
}

async function configureMandates(context: ProtocolContext): Promise<void> {
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.proposer, context.proposer, PROPOSAL_TYPE.standard, "ipfs://standard-proposer");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.proposer, context.proposer, PROPOSAL_TYPE.treasury, "ipfs://treasury-proposer");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, context.councilApprover, PROPOSAL_TYPE.standard, "ipfs://standard-approver");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, context.councilApprover, PROPOSAL_TYPE.treasury, "ipfs://treasury-council-approver");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.treasuryBodyId, ROLE_TYPE.approver, context.treasuryApprover, PROPOSAL_TYPE.treasury, "ipfs://treasury-approver");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.securityBodyId, ROLE_TYPE.vetoer, context.vetoer, PROPOSAL_TYPE.treasury, "ipfs://treasury-vetoer");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.executor, context.executor, PROPOSAL_TYPE.standard, "ipfs://standard-executor");
  await grantRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.executor, context.executor, PROPOSAL_TYPE.treasury, "ipfs://treasury-executor");
}

async function createProposal(context: ProtocolContext, proposalType: bigint, target: string, number: bigint): Promise<{ proposalId: bigint; actionData: string; dataHash: string }> {
  const proposalId: bigint = await nextProposalId(context.govProposals);
  const action = createAction(context.demoTarget, context.orgA.orgId, number);
  await invoke(context.govProposals.connect(context.proposer), "createProposal", [context.orgA.orgId, proposalType, target, 0, action.dataHash, `ipfs://proposal-${proposalId}`]);
  return { proposalId, actionData: action.actionData, dataHash: action.dataHash };
}

async function approveTreasury(context: ProtocolContext, proposalId: bigint): Promise<void> {
  await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposalId, context.orgA.bodies.councilBodyId]);
  await invoke(context.govProposals.connect(context.treasuryApprover), "approveProposal", [context.orgA.orgId, proposalId, context.orgA.bodies.treasuryBodyId]);
}

async function deployProtocol(): Promise<ProtocolContext> {
  const [deployer, orgAdminA, orgAdminB, proposer, councilApprover, treasuryApprover, vetoer, executor, outsider]: SignerWithAddress[] = await ethers.getSigners();
  const govCore: DeployedContract = await ethers.deployContract("GovCore") as unknown as DeployedContract;
  const demoTarget: DeployedContract = await ethers.deployContract("DemoTarget", [deployer.address]) as unknown as DeployedContract;
  const govProposals: DeployedContract = await ethers.deployContract("GovProposals", [await govCore.getAddress(), await demoTarget.getAddress()]) as unknown as DeployedContract;
  await invoke(demoTarget, "setGovProposals", [await govProposals.getAddress()]);
  const orgA: OrgContext = await createOrgContext(govCore, orgAdminA, "alpha");
  const orgB: OrgContext = await createOrgContext(govCore, orgAdminB, "beta");
  const context: ProtocolContext = { govCore, govProposals, demoTarget, orgAdminA, orgAdminB, proposer, councilApprover, treasuryApprover, vetoer, executor, outsider, orgA, orgB };
  await configureMandates(context);
  await configurePolicies(govCore, orgAdminA, orgA);
  return context;
}

async function increaseTime(seconds: bigint): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

describe("Protocol v0.1", function () {
  it("isolates organizations by orgId", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    await expect(
      invoke(context.govCore.connect(context.orgAdminA), "setPolicyRule", [context.orgA.orgId, PROPOSAL_TYPE.standard, singleBody(context.orgB.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0, true]),
    )
      .to.be.revertedWithCustomError(context.govCore, "BodyDoesNotBelongToOrg")
      .withArgs(context.orgA.orgId, context.orgB.bodies.councilBodyId);
  });

  it("executes a standard proposal end-to-end against DemoTarget", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), 77n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await invoke(context.govProposals.connect(context.outsider), "queueProposal", [context.orgA.orgId, proposal.proposalId]);
    await invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]);
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    expect(proposalState.status).to.equal(PROPOSAL_STATUS.executed);
    expect(await readBigInt(context.demoTarget, "number")).to.equal(77n);
    expect(await readBigInt(context.demoTarget, "lastOrgId")).to.equal(context.orgA.orgId);
  });

  it("enforces treasury timelock before execution", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.treasury, await context.demoTarget.getAddress(), 123n);
    await approveTreasury(context, proposal.proposalId);
    await invoke(context.govProposals.connect(context.outsider), "queueProposal", [context.orgA.orgId, proposal.proposalId]);
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "TimelockNotExpired")
      .withArgs(proposal.proposalId, proposalState.executableAt);
    await increaseTime(ONE_HOUR + 1n);
    await invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]);
    expect(await readBigInt(context.demoTarget, "number")).to.equal(123n);
  });

  it("keeps the original policy route after a later policy update", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.treasury, await context.demoTarget.getAddress(), 124n);
    await invoke(context.govCore.connect(context.orgAdminA), "setPolicyRule", [context.orgA.orgId, PROPOSAL_TYPE.treasury, singleBody(context.orgA.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0, true]);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await expect(
      invoke(context.govProposals.connect(context.outsider), "queueProposal", [context.orgA.orgId, proposal.proposalId]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "InvalidProposalStatus")
      .withArgs(2n);
    await invoke(context.govProposals.connect(context.treasuryApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.treasuryBodyId]);
    await invoke(context.govProposals.connect(context.outsider), "queueProposal", [context.orgA.orgId, proposal.proposalId]);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "TimelockNotExpired");
  });

  it("allows veto and blocks later execution", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.treasury, await context.demoTarget.getAddress(), 222n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await invoke(context.govProposals.connect(context.vetoer), "vetoProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.securityBodyId]);
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    expect(proposalState.status).to.equal(PROPOSAL_STATUS.vetoed);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "InvalidProposalStatus")
      .withArgs(PROPOSAL_STATUS.vetoed);
  });

  it("blocks execution on data hash mismatch", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), 333n);
    const wrongAction = createAction(context.demoTarget, context.orgA.orgId, 444n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, wrongAction.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "DataHashMismatch")
      .withArgs(proposal.dataHash, wrongAction.dataHash);
  });

  it("blocks execution to a non-whitelisted target", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, context.outsider.address, 555n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "TargetNotAllowed")
      .withArgs(context.outsider.address);
  });

  it("rejects approval from an unauthorized actor", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), 666n);
    await expect(
      invoke(context.govProposals.connect(context.outsider), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "Unauthorized")
      .withArgs(context.outsider.address);
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    expect(proposalState.status).to.not.equal(PROPOSAL_STATUS.approved);
  });
});
