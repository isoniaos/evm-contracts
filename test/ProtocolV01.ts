import { expect } from "chai";
import { network } from "hardhat";
import type { BaseContract } from "ethers";

const hardhatRuntime: Awaited<ReturnType<typeof network.create>> = await network.create();
const { ethers } = hardhatRuntime;
type EthersHelpers = typeof ethers;
type DeployedContract = BaseContract;
type SignerWithAddress = Awaited<ReturnType<EthersHelpers["getSigners"]>>[number];
const EXECUTION_TARGET_MAX_VALUE = ethers.parseEther("1");

const BODY_KIND = {
  unknown: 0n,
  generalCouncil: 1n,
  treasuryCommittee: 2n,
  securityCouncil: 3n,
} as const;

const ROLE_TYPE = {
  unknown: 0n,
  proposer: 3n,
  approver: 4n,
  vetoer: 5n,
  executor: 6n,
} as const;

const PROPOSAL_TYPE = {
  unknown: 0n,
  standard: 1n,
  treasury: 2n,
  upgrade: 3n,
  emergency: 4n,
} as const;

const PROPOSAL_STATUS = {
  approved: 3n,
  queued: 4n,
  vetoed: 5n,
  executed: 6n,
} as const;

const DEMO_TARGET_FUNCTIONS = [
  "setNumber(uint64,uint256)",
  "setFeatureEnabled(uint64,bytes32,bool)",
  "setUintParam(uint64,bytes32,uint256)",
  "releaseNativePayment(uint64,bytes32,address)",
  "markObligationAccepted(uint64,bytes32)",
  "markObligationCancelled(uint64,bytes32,string)",
] as const;

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

interface BodyView {
  readonly orgId: bigint;
  readonly kind: bigint;
  readonly active: boolean;
  readonly metadataURI: string;
}

interface RoleView {
  readonly orgId: bigint;
  readonly bodyId: bigint;
  readonly roleType: bigint;
  readonly active: boolean;
  readonly metadataURI: string;
}

interface MandateView {
  readonly orgId: bigint;
  readonly bodyId: bigint;
  readonly roleId: bigint;
  readonly holder: string;
  readonly active: boolean;
  readonly revoked: boolean;
}

interface PolicyRuleView {
  readonly version: bigint;
  readonly requiredApprovalBodies: readonly bigint[];
  readonly vetoBodies: readonly bigint[];
  readonly executorBody: bigint;
  readonly timelockSeconds: bigint;
  readonly enabled: boolean;
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

interface DeployProtocolOptions {
  readonly configureDemoTarget?: boolean;
}

interface ProposalView {
  readonly status: bigint;
  readonly actionSelector: string;
  readonly dataHash: string;
  readonly executableAt: bigint;
}

interface ProposalAction {
  readonly actionData: string;
  readonly actionSelector: string;
  readonly dataHash: string;
}

type BodyCreateInput = [bigint, string];
type RoleCreateInput = [bigint, bigint, string];
type MandateAssignInput = [bigint, string, bigint, bigint, bigint, bigint];
type PolicyRuleSetInput = [bigint, bigint[], bigint[], bigint, bigint, boolean];

function singleBody(bodyId: bigint): bigint[] {
  return [bodyId];
}

function selectorFromActionData(actionData: string): string {
  if (actionData.length < 10) {
    throw new Error("Action data is shorter than a function selector");
  }
  return `0x${actionData.slice(2, 10)}`;
}

function createAction(demoTarget: DeployedContract, orgId: bigint, number: bigint): ProposalAction {
  const actionData: string = demoTarget.interface.encodeFunctionData("setNumber", [orgId, number]);
  return { actionData, actionSelector: selectorFromActionData(actionData), dataHash: ethers.keccak256(actionData) };
}

function createTargetAction(demoTarget: DeployedContract, methodName: string, args: readonly unknown[]): ProposalAction {
  const actionData: string = demoTarget.interface.encodeFunctionData(methodName, args);
  return { actionData, actionSelector: selectorFromActionData(actionData), dataHash: ethers.keccak256(actionData) };
}

function selectorFor(contract: DeployedContract, signature: string): string {
  const fragment = contract.interface.getFunction(signature);
  if (fragment === null) {
    throw new Error(`Unknown function signature: ${signature}`);
  }
  return fragment.selector;
}

function eventTopic(contract: DeployedContract, eventName: string): string {
  const fragment = contract.interface.getEvent(eventName);
  if (fragment === null) {
    throw new Error(`Unknown event name: ${eventName}`);
  }
  return fragment.topicHash;
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

async function nextMandateId(govCore: DeployedContract): Promise<bigint> {
  return readBigInt(govCore, "nextMandateId");
}

async function nextProposalId(govProposals: DeployedContract): Promise<bigint> {
  return readBigInt(govProposals, "nextProposalId");
}

async function readBigInt(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<bigint> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as bigint;
}

async function readBoolean(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<boolean> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as boolean;
}

async function readAddress(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<string> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as string;
}

async function invoke(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<void> {
  const method = contract.getFunction(methodName);
  await method(...args);
}

async function expectNoPersistedEventLogSince(blockBefore: number, contract: DeployedContract, contractAddress: string, eventName: string): Promise<void> {
  const latestBlock = await ethers.provider.getBlockNumber();
  if (latestBlock <= blockBefore) {
    return;
  }
  const logs = await ethers.provider.getLogs({
    address: contractAddress,
    fromBlock: blockBefore + 1,
    toBlock: latestBlock,
    topics: [eventTopic(contract, eventName)],
  });
  expect(logs).to.have.length(0);
}

async function readProposal(govProposals: DeployedContract, proposalId: bigint): Promise<ProposalView> {
  const method = govProposals.getFunction("proposals");
  const proposal = await method(proposalId) as { status: bigint; actionSelector: string; dataHash: string; executableAt: bigint };
  return {
    status: proposal.status,
    actionSelector: proposal.actionSelector,
    dataHash: proposal.dataHash,
    executableAt: proposal.executableAt,
  };
}

async function readBody(govCore: DeployedContract, bodyId: bigint): Promise<BodyView> {
  const method = govCore.getFunction("bodies");
  const body = await method(bodyId) as BodyView;
  return body;
}

async function readRole(govCore: DeployedContract, roleId: bigint): Promise<RoleView> {
  const method = govCore.getFunction("roles");
  const role = await method(roleId) as RoleView;
  return role;
}

async function readMandate(govCore: DeployedContract, mandateId: bigint): Promise<MandateView> {
  const method = govCore.getFunction("mandates");
  const mandate = await method(mandateId) as MandateView;
  return mandate;
}

async function readPolicyRule(govCore: DeployedContract, orgId: bigint, proposalType: bigint): Promise<PolicyRuleView> {
  const method = govCore.getFunction("getPolicyRule");
  const rule = await method(orgId, proposalType) as PolicyRuleView;
  return rule;
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

async function assignMandate(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, roleId: bigint, holder: SignerWithAddress, proposalType: bigint): Promise<bigint> {
  const mandateId: bigint = await nextMandateId(govCore);
  const proposalTypeMask: bigint = 1n << proposalType;
  await invoke(govCore.connect(admin), "assignMandate", [orgId, roleId, holder.address, 0, 0, proposalTypeMask, 0]);
  return mandateId;
}

async function grantRole(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint, bodyId: bigint, roleType: bigint, holder: SignerWithAddress, proposalType: bigint, metadataUri: string): Promise<void> {
  const roleId: bigint = await createRole(govCore, admin, orgId, bodyId, roleType, metadataUri);
  await assignMandate(govCore, admin, orgId, roleId, holder, proposalType);
}

async function finalizeOrganization(govCore: DeployedContract, admin: SignerWithAddress, orgId: bigint): Promise<void> {
  await invoke(govCore.connect(admin), "finalizeOrganization", [orgId]);
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

async function configureExecutionTarget(
  govProposals: DeployedContract,
  orgAdmin: SignerWithAddress,
  orgId: bigint,
  target: string,
  maxValue: bigint = EXECUTION_TARGET_MAX_VALUE,
): Promise<void> {
  await invoke(govProposals.connect(orgAdmin), "setExecutionTargetRule", [orgId, target, true, maxValue]);
}

async function configureExecutionSelector(
  govProposals: DeployedContract,
  orgAdmin: SignerWithAddress,
  orgId: bigint,
  target: string,
  selector: string,
): Promise<void> {
  await invoke(govProposals.connect(orgAdmin), "setExecutionSelectorRule", [orgId, target, selector, true]);
}

async function deployOrgExecutor(govProposals: DeployedContract, orgId: bigint): Promise<DeployedContract> {
  return await ethers.deployContract("IsoOrgExecutor", [await govProposals.getAddress(), orgId]) as unknown as DeployedContract;
}

async function configureDemoTargetExecutionRules(context: ProtocolContext): Promise<void> {
  const target = await context.demoTarget.getAddress();
  await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);

  for (const signature of DEMO_TARGET_FUNCTIONS) {
    await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selectorFor(context.demoTarget, signature));
  }
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

async function createProposalForAction(
  context: ProtocolContext,
  proposalType: bigint,
  target: string,
  action: ProposalAction,
  value: bigint = 0n,
): Promise<{ proposalId: bigint; actionData: string; actionSelector: string; dataHash: string; value: bigint }> {
  const proposalId: bigint = await nextProposalId(context.govProposals);
  await invoke(context.govProposals.connect(context.proposer), "createProposal", [context.orgA.orgId, proposalType, target, value, action.actionSelector, action.dataHash, `ipfs://proposal-${proposalId}`]);
  return { proposalId, actionData: action.actionData, actionSelector: action.actionSelector, dataHash: action.dataHash, value };
}

async function createProposal(context: ProtocolContext, proposalType: bigint, target: string, number: bigint): Promise<{ proposalId: bigint; actionData: string; actionSelector: string; dataHash: string; value: bigint }> {
  const action = createAction(context.demoTarget, context.orgA.orgId, number);
  return createProposalForAction(context, proposalType, target, action);
}

async function approveTreasury(context: ProtocolContext, proposalId: bigint): Promise<void> {
  await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposalId, context.orgA.bodies.councilBodyId]);
  await invoke(context.govProposals.connect(context.treasuryApprover), "approveProposal", [context.orgA.orgId, proposalId, context.orgA.bodies.treasuryBodyId]);
}

async function deployProtocol(options: DeployProtocolOptions = {}): Promise<ProtocolContext> {
  const [deployer, orgAdminA, orgAdminB, proposer, councilApprover, treasuryApprover, vetoer, executor, outsider]: SignerWithAddress[] = await ethers.getSigners();
  const govCore: DeployedContract = await ethers.deployContract("GovCore") as unknown as DeployedContract;
  const demoTarget: DeployedContract = await ethers.deployContract("DemoTarget", [deployer.address]) as unknown as DeployedContract;
  const govProposals: DeployedContract = await ethers.deployContract("GovProposals", [await govCore.getAddress()]) as unknown as DeployedContract;
  await invoke(demoTarget, "setGovProposals", [await govProposals.getAddress()]);
  const orgA: OrgContext = await createOrgContext(govCore, orgAdminA, "alpha");
  const orgB: OrgContext = await createOrgContext(govCore, orgAdminB, "beta");
  const context: ProtocolContext = { govCore, govProposals, demoTarget, orgAdminA, orgAdminB, proposer, councilApprover, treasuryApprover, vetoer, executor, outsider, orgA, orgB };
  await configureMandates(context);
  await configurePolicies(govCore, orgAdminA, orgA);
  if (options.configureDemoTarget ?? true) {
    await configureDemoTargetExecutionRules(context);
  }
  return context;
}

async function increaseTime(seconds: bigint): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

describe("Protocol v0.1", function () {
  describe("typed admin batch activation", function () {
    it("creates bodies in a typed batch and emits the existing per-body events", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const firstBodyId: bigint = await nextBodyId(context.govCore);
      const inputs: BodyCreateInput[] = [
        [BODY_KIND.generalCouncil, "ipfs://batch-council"],
        [BODY_KIND.securityCouncil, "ipfs://batch-security"],
      ];
      const batchCreateBodies = context.govCore.connect(context.orgAdminA).getFunction("batchCreateBodies");

      await expect(batchCreateBodies(context.orgA.orgId, inputs))
        .to.emit(context.govCore, "BodyCreated")
        .withArgs(context.orgA.orgId, firstBodyId, BODY_KIND.generalCouncil, "ipfs://batch-council")
        .and.to.emit(context.govCore, "BodyCreated")
        .withArgs(context.orgA.orgId, firstBodyId + 1n, BODY_KIND.securityCouncil, "ipfs://batch-security");

      expect(await nextBodyId(context.govCore)).to.equal(firstBodyId + 2n);
      const firstBody: BodyView = await readBody(context.govCore, firstBodyId);
      const secondBody: BodyView = await readBody(context.govCore, firstBodyId + 1n);
      expect(firstBody.orgId).to.equal(context.orgA.orgId);
      expect(firstBody.kind).to.equal(BODY_KIND.generalCouncil);
      expect(firstBody.active).to.equal(true);
      expect(firstBody.metadataURI).to.equal("ipfs://batch-council");
      expect(secondBody.orgId).to.equal(context.orgA.orgId);
      expect(secondBody.kind).to.equal(BODY_KIND.securityCouncil);
      expect(secondBody.active).to.equal(true);
      expect(secondBody.metadataURI).to.equal("ipfs://batch-security");
    });

    it("creates roles in a typed batch and emits the existing per-role events", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const firstRoleId: bigint = await nextRoleId(context.govCore);
      const inputs: RoleCreateInput[] = [
        [context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://batch-approver"],
        [context.orgA.bodies.securityBodyId, ROLE_TYPE.vetoer, "ipfs://batch-vetoer"],
      ];
      const batchCreateRoles = context.govCore.connect(context.orgAdminA).getFunction("batchCreateRoles");

      await expect(batchCreateRoles(context.orgA.orgId, inputs))
        .to.emit(context.govCore, "RoleCreated")
        .withArgs(context.orgA.orgId, firstRoleId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://batch-approver")
        .and.to.emit(context.govCore, "RoleCreated")
        .withArgs(context.orgA.orgId, firstRoleId + 1n, context.orgA.bodies.securityBodyId, ROLE_TYPE.vetoer, "ipfs://batch-vetoer");

      expect(await nextRoleId(context.govCore)).to.equal(firstRoleId + 2n);
      const firstRole: RoleView = await readRole(context.govCore, firstRoleId);
      const secondRole: RoleView = await readRole(context.govCore, firstRoleId + 1n);
      expect(firstRole.orgId).to.equal(context.orgA.orgId);
      expect(firstRole.bodyId).to.equal(context.orgA.bodies.councilBodyId);
      expect(firstRole.roleType).to.equal(ROLE_TYPE.approver);
      expect(firstRole.active).to.equal(true);
      expect(firstRole.metadataURI).to.equal("ipfs://batch-approver");
      expect(secondRole.orgId).to.equal(context.orgA.orgId);
      expect(secondRole.bodyId).to.equal(context.orgA.bodies.securityBodyId);
      expect(secondRole.roleType).to.equal(ROLE_TYPE.vetoer);
      expect(secondRole.active).to.equal(true);
      expect(secondRole.metadataURI).to.equal("ipfs://batch-vetoer");
    });

    it("assigns mandates in a typed batch and emits the existing per-mandate events", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const approverRoleId: bigint = await createRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://batch-mandate-approver");
      const executorRoleId: bigint = await createRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.executor, "ipfs://batch-mandate-executor");
      const firstMandateId: bigint = await nextMandateId(context.govCore);
      const standardMask: bigint = 1n << PROPOSAL_TYPE.standard;
      const treasuryMask: bigint = 1n << PROPOSAL_TYPE.treasury;
      const inputs: MandateAssignInput[] = [
        [approverRoleId, context.councilApprover.address, 0n, 0n, standardMask, 0n],
        [executorRoleId, context.executor.address, 0n, 0n, treasuryMask, 0n],
      ];
      const batchAssignMandates = context.govCore.connect(context.orgAdminA).getFunction("batchAssignMandates");

      await expect(batchAssignMandates(context.orgA.orgId, inputs))
        .to.emit(context.govCore, "MandateAssigned")
        .withArgs(context.orgA.orgId, firstMandateId, approverRoleId, context.orgA.bodies.councilBodyId, context.councilApprover.address, 0n, 0n, standardMask, 0n)
        .and.to.emit(context.govCore, "MandateAssigned")
        .withArgs(context.orgA.orgId, firstMandateId + 1n, executorRoleId, context.orgA.bodies.councilBodyId, context.executor.address, 0n, 0n, treasuryMask, 0n);

      expect(await nextMandateId(context.govCore)).to.equal(firstMandateId + 2n);
      const firstMandate: MandateView = await readMandate(context.govCore, firstMandateId);
      const secondMandate: MandateView = await readMandate(context.govCore, firstMandateId + 1n);
      expect(firstMandate.orgId).to.equal(context.orgA.orgId);
      expect(firstMandate.roleId).to.equal(approverRoleId);
      expect(firstMandate.holder).to.equal(context.councilApprover.address);
      expect(firstMandate.active).to.equal(true);
      expect(firstMandate.revoked).to.equal(false);
      expect(secondMandate.orgId).to.equal(context.orgA.orgId);
      expect(secondMandate.roleId).to.equal(executorRoleId);
      expect(secondMandate.holder).to.equal(context.executor.address);
      expect(secondMandate.active).to.equal(true);
      expect(secondMandate.revoked).to.equal(false);
    });

    it("sets policy rules in a typed batch and emits the existing per-policy events", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const inputs: PolicyRuleSetInput[] = [
        [PROPOSAL_TYPE.standard, singleBody(context.orgB.bodies.councilBodyId), [], context.orgB.bodies.councilBodyId, 0n, true],
        [PROPOSAL_TYPE.emergency, singleBody(context.orgB.bodies.securityBodyId), singleBody(context.orgB.bodies.councilBodyId), context.orgB.bodies.securityBodyId, 60n, true],
      ];
      const batchSetPolicyRules = context.govCore.connect(context.orgAdminB).getFunction("batchSetPolicyRules");

      await expect(batchSetPolicyRules(context.orgB.orgId, inputs))
        .to.emit(context.govCore, "PolicyRuleSet")
        .withArgs(context.orgB.orgId, PROPOSAL_TYPE.standard, 1n, singleBody(context.orgB.bodies.councilBodyId), [], context.orgB.bodies.councilBodyId, 0n, true)
        .and.to.emit(context.govCore, "PolicyRuleSet")
        .withArgs(context.orgB.orgId, PROPOSAL_TYPE.emergency, 1n, singleBody(context.orgB.bodies.securityBodyId), singleBody(context.orgB.bodies.councilBodyId), context.orgB.bodies.securityBodyId, 60n, true);

      const standardRule: PolicyRuleView = await readPolicyRule(context.govCore, context.orgB.orgId, PROPOSAL_TYPE.standard);
      const emergencyRule: PolicyRuleView = await readPolicyRule(context.govCore, context.orgB.orgId, PROPOSAL_TYPE.emergency);
      expect(standardRule.version).to.equal(1n);
      expect([...standardRule.requiredApprovalBodies]).to.deep.equal(singleBody(context.orgB.bodies.councilBodyId));
      expect([...standardRule.vetoBodies]).to.deep.equal([]);
      expect(standardRule.executorBody).to.equal(context.orgB.bodies.councilBodyId);
      expect(standardRule.timelockSeconds).to.equal(0n);
      expect(standardRule.enabled).to.equal(true);
      expect(emergencyRule.version).to.equal(1n);
      expect([...emergencyRule.requiredApprovalBodies]).to.deep.equal(singleBody(context.orgB.bodies.securityBodyId));
      expect([...emergencyRule.vetoBodies]).to.deep.equal(singleBody(context.orgB.bodies.councilBodyId));
      expect(emergencyRule.executorBody).to.equal(context.orgB.bodies.securityBodyId);
      expect(emergencyRule.timelockSeconds).to.equal(60n);
      expect(emergencyRule.enabled).to.equal(true);
    });

    it("keeps the serial admin setup functions working", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const bodyId: bigint = await createBody(context.govCore, context.orgAdminB, context.orgB.orgId, BODY_KIND.generalCouncil, "ipfs://serial-body");
      const roleId: bigint = await createRole(context.govCore, context.orgAdminB, context.orgB.orgId, bodyId, ROLE_TYPE.approver, "ipfs://serial-role");
      await assignMandate(context.govCore, context.orgAdminB, context.orgB.orgId, roleId, context.treasuryApprover, PROPOSAL_TYPE.standard);
      await invoke(context.govCore.connect(context.orgAdminB), "setPolicyRule", [context.orgB.orgId, PROPOSAL_TYPE.standard, singleBody(bodyId), [], bodyId, 0, true]);

      const canApprove: boolean = await context.govCore.getFunction("canActOnProposalType")(context.orgB.orgId, context.treasuryApprover.address, bodyId, ROLE_TYPE.approver, PROPOSAL_TYPE.standard) as boolean;
      const rule: PolicyRuleView = await readPolicyRule(context.govCore, context.orgB.orgId, PROPOSAL_TYPE.standard);
      expect(canApprove).to.equal(true);
      expect(rule.version).to.equal(1n);
      expect([...rule.requiredApprovalBodies]).to.deep.equal(singleBody(bodyId));
    });

    it("rejects typed batch calls from non-admin callers", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const inputs: BodyCreateInput[] = [[BODY_KIND.generalCouncil, "ipfs://unauthorized-body"]];

      await expect(invoke(context.govCore.connect(context.outsider), "batchCreateBodies", [context.orgA.orgId, inputs]))
        .to.be.revertedWithCustomError(context.govCore, "Unauthorized")
        .withArgs(context.outsider.address);
    });

    it("rejects empty typed batches explicitly", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();

      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateBodies", [context.orgA.orgId, []]))
        .to.be.revertedWithCustomError(context.govCore, "EmptyBatch");
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateRoles", [context.orgA.orgId, []]))
        .to.be.revertedWithCustomError(context.govCore, "EmptyBatch");
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchAssignMandates", [context.orgA.orgId, []]))
        .to.be.revertedWithCustomError(context.govCore, "EmptyBatch");
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchSetPolicyRules", [context.orgA.orgId, []]))
        .to.be.revertedWithCustomError(context.govCore, "EmptyBatch");
    });

    it("rejects invalid typed batch references with the existing custom errors", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const missingRoleId = 99_999n;

      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateRoles", [context.orgA.orgId, [[context.orgB.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://foreign-body-role"]]]))
        .to.be.revertedWithCustomError(context.govCore, "BodyDoesNotBelongToOrg")
        .withArgs(context.orgA.orgId, context.orgB.bodies.councilBodyId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchAssignMandates", [context.orgA.orgId, [[missingRoleId, context.councilApprover.address, 0n, 0n, 1n << PROPOSAL_TYPE.standard, 0n]]]))
        .to.be.revertedWithCustomError(context.govCore, "RoleNotFound")
        .withArgs(missingRoleId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchSetPolicyRules", [context.orgA.orgId, [[PROPOSAL_TYPE.treasury, singleBody(context.orgB.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0n, true]]]))
        .to.be.revertedWithCustomError(context.govCore, "BodyDoesNotBelongToOrg")
        .withArgs(context.orgA.orgId, context.orgB.bodies.councilBodyId);
    });

    it("reverts the whole typed batch when any item fails", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const nextIdBefore: bigint = await nextBodyId(context.govCore);
      const inputs: BodyCreateInput[] = [
        [BODY_KIND.generalCouncil, "ipfs://valid-before-failure"],
        [BODY_KIND.unknown, "ipfs://invalid-kind"],
      ];

      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateBodies", [context.orgA.orgId, inputs]))
        .to.be.revertedWithCustomError(context.govCore, "InvalidBodyKind");
      expect(await nextBodyId(context.govCore)).to.equal(nextIdBefore);
      const revertedBody: BodyView = await readBody(context.govCore, nextIdBefore);
      expect(revertedBody.orgId).to.equal(0n);
      expect(revertedBody.active).to.equal(false);
    });
  });

  describe("bootstrap finalization", function () {
    it("allows the bootstrap admin to finalize an active organization and emits the finalization event", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const finalize = context.govCore.connect(context.orgAdminA).getFunction("finalizeOrganization");

      expect(await readBoolean(context.govCore, "isOrganizationFinalized", [context.orgA.orgId])).to.equal(false);
      await expect(finalize(context.orgA.orgId))
        .to.emit(context.govCore, "OrganizationFinalized")
        .withArgs(context.orgA.orgId, context.orgAdminA.address);

      expect(await readBoolean(context.govCore, "isOrganizationFinalized", [context.orgA.orgId])).to.equal(true);
      expect(await readBoolean(context.govCore, "isOrganizationActive", [context.orgA.orgId])).to.equal(true);
    });

    it("rejects finalization from a non-admin caller", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();

      await expect(invoke(context.govCore.connect(context.outsider), "finalizeOrganization", [context.orgA.orgId]))
        .to.be.revertedWithCustomError(context.govCore, "Unauthorized")
        .withArgs(context.outsider.address);
    });

    it("rejects repeated finalization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);

      await expect(invoke(context.govCore.connect(context.orgAdminA), "finalizeOrganization", [context.orgA.orgId]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
    });

    it("rejects finalization for a nonexistent organization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const missingOrgId = 99_999n;

      await expect(invoke(context.govCore.connect(context.orgAdminA), "finalizeOrganization", [missingOrgId]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationNotFound")
        .withArgs(missingOrgId);
    });

    it("blocks serial bootstrap configuration after finalization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const preFinalizationRoleId: bigint = await createRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://pre-finalization-role");
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);

      await expect(invoke(context.govCore.connect(context.orgAdminA), "createBody", [context.orgA.orgId, BODY_KIND.generalCouncil, "ipfs://blocked-body"]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "createRole", [context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://blocked-role"]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "assignMandate", [context.orgA.orgId, preFinalizationRoleId, context.outsider.address, 0n, 0n, 1n << PROPOSAL_TYPE.standard, 0n]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "setPolicyRule", [context.orgA.orgId, PROPOSAL_TYPE.standard, singleBody(context.orgA.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0n, true]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
    });

    it("blocks typed batch bootstrap configuration after finalization without partial execution", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const preFinalizationRoleId: bigint = await createRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://pre-finalization-batch-role");
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);
      const nextBodyIdBefore: bigint = await nextBodyId(context.govCore);

      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateBodies", [context.orgA.orgId, [[BODY_KIND.generalCouncil, "ipfs://blocked-batch-body"]]]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchCreateRoles", [context.orgA.orgId, [[context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://blocked-batch-role"]]]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchAssignMandates", [context.orgA.orgId, [[preFinalizationRoleId, context.outsider.address, 0n, 0n, 1n << PROPOSAL_TYPE.standard, 0n]]]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "batchSetPolicyRules", [context.orgA.orgId, [[PROPOSAL_TYPE.standard, singleBody(context.orgA.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0n, true]]]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      expect(await nextBodyId(context.govCore)).to.equal(nextBodyIdBefore);
    });

    it("keeps read-only governance getters available after finalization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const roleId: bigint = await createRole(context.govCore, context.orgAdminB, context.orgB.orgId, context.orgB.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://finalized-readable-role");
      const mandateId: bigint = await assignMandate(context.govCore, context.orgAdminB, context.orgB.orgId, roleId, context.treasuryApprover, PROPOSAL_TYPE.standard);
      await invoke(context.govCore.connect(context.orgAdminB), "setPolicyRule", [context.orgB.orgId, PROPOSAL_TYPE.standard, singleBody(context.orgB.bodies.councilBodyId), [], context.orgB.bodies.councilBodyId, 0n, true]);
      await finalizeOrganization(context.govCore, context.orgAdminB, context.orgB.orgId);

      const body: BodyView = await readBody(context.govCore, context.orgB.bodies.councilBodyId);
      const role: RoleView = await readRole(context.govCore, roleId);
      const mandate: MandateView = await readMandate(context.govCore, mandateId);
      const rule: PolicyRuleView = await readPolicyRule(context.govCore, context.orgB.orgId, PROPOSAL_TYPE.standard);
      const canApprove: boolean = await readBoolean(context.govCore, "canActOnProposalType", [context.orgB.orgId, context.treasuryApprover.address, context.orgB.bodies.councilBodyId, ROLE_TYPE.approver, PROPOSAL_TYPE.standard]);

      expect(body.orgId).to.equal(context.orgB.orgId);
      expect(role.orgId).to.equal(context.orgB.orgId);
      expect(mandate.orgId).to.equal(context.orgB.orgId);
      expect(rule.enabled).to.equal(true);
      expect(canApprove).to.equal(true);
      expect(await readBoolean(context.govCore, "isOrganizationFinalized", [context.orgB.orgId])).to.equal(true);
    });

    it("blocks remaining bootstrap admin escape paths after finalization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const roleId: bigint = await createRole(context.govCore, context.orgAdminA, context.orgA.orgId, context.orgA.bodies.councilBodyId, ROLE_TYPE.approver, "ipfs://escape-path-role");
      const mandateId: bigint = await assignMandate(context.govCore, context.orgAdminA, context.orgA.orgId, roleId, context.treasuryApprover, PROPOSAL_TYPE.standard);
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);

      await expect(invoke(context.govCore.connect(context.orgAdminA), "updateBody", [context.orgA.orgId, context.orgA.bodies.councilBodyId, false, "ipfs://blocked-body-update"]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "updateRole", [context.orgA.orgId, roleId, false, "ipfs://blocked-role-update"]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "revokeMandate", [context.orgA.orgId, mandateId]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govCore.connect(context.orgAdminA), "setOrganizationStatus", [context.orgA.orgId, 2n]))
        .to.be.revertedWithCustomError(context.govCore, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
    });

    it("blocks execution registry bootstrap configuration after finalization", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const target = await context.demoTarget.getAddress();
      const selector = selectorFor(context.demoTarget, "setNumber(uint64,uint256)");
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);

      await expect(invoke(context.govProposals.connect(context.orgAdminA), "setExecutionTargetRule", [context.orgA.orgId, target, false, 0n]))
        .to.be.revertedWithCustomError(context.govProposals, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govProposals.connect(context.orgAdminA), "setExecutionSelectorRule", [context.orgA.orgId, target, selector, false]))
        .to.be.revertedWithCustomError(context.govProposals, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
      await expect(invoke(context.govProposals.connect(context.orgAdminA), "setOrgExecutor", [context.orgA.orgId, await orgExecutor.getAddress()]))
        .to.be.revertedWithCustomError(context.govProposals, "OrganizationAlreadyFinalized")
        .withArgs(context.orgA.orgId);
    });

    it("does not leave proposal cancellation as a post-finalization admin override", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      await finalizeOrganization(context.govCore, context.orgAdminA, context.orgA.orgId);
      const proposal = await createProposal(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), 909n);

      await expect(invoke(context.govProposals.connect(context.orgAdminA), "cancelProposal", [context.orgA.orgId, proposal.proposalId]))
        .to.be.revertedWithCustomError(context.govProposals, "Unauthorized")
        .withArgs(context.orgAdminA.address);
    });
  });

  it("isolates organizations by orgId", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    await expect(
      invoke(context.govCore.connect(context.orgAdminA), "setPolicyRule", [context.orgA.orgId, PROPOSAL_TYPE.standard, singleBody(context.orgB.bodies.councilBodyId), [], context.orgA.bodies.councilBodyId, 0, true]),
    )
      .to.be.revertedWithCustomError(context.govCore, "BodyDoesNotBelongToOrg")
      .withArgs(context.orgA.orgId, context.orgB.bodies.councilBodyId);
  });

  it("stores and emits selector-aware proposal action identity", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const target = await context.demoTarget.getAddress();
    const action = createAction(context.demoTarget, context.orgA.orgId, 76n);
    const proposalId = await nextProposalId(context.govProposals);
    const metadataURI = `ipfs://proposal-${proposalId}`;
    const rule = await readPolicyRule(context.govCore, context.orgA.orgId, PROPOSAL_TYPE.standard);
    const createProposalFunction = context.govProposals.connect(context.proposer).getFunction("createProposal");

    await expect(createProposalFunction(context.orgA.orgId, PROPOSAL_TYPE.standard, target, 0n, action.actionSelector, action.dataHash, metadataURI))
      .to.emit(context.govProposals, "ProposalCreated")
      .withArgs(context.orgA.orgId, proposalId, PROPOSAL_TYPE.standard, rule.version, context.proposer.address, target, 0n, action.actionSelector, action.dataHash, metadataURI);

    const stored = await readProposal(context.govProposals, proposalId);
    expect(stored.actionSelector).to.equal(action.actionSelector);
    expect(stored.dataHash).to.equal(action.dataHash);
  });

  it("executes a standard proposal end-to-end against an explicitly configured DemoTarget selector", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const target = await context.demoTarget.getAddress();
    const selector = selectorFor(context.demoTarget, "setNumber(uint64,uint256)");
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), 77n);
    expect(await readBoolean(context.govProposals, "isExecutionTargetAllowed", [context.orgA.orgId, target])).to.equal(true);
    expect(await readBoolean(context.govProposals, "isExecutionSelectorAllowed", [context.orgA.orgId, target, selector])).to.equal(true);
    expect(await readAddress(context.govProposals, "getOrgExecutor", [context.orgA.orgId])).to.equal(ethers.ZeroAddress);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await invoke(context.govProposals.connect(context.outsider), "queueProposal", [context.orgA.orgId, proposal.proposalId]);
    const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");
    await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
      .to.emit(context.govProposals, "ProposalExecuted")
      .withArgs(context.orgA.orgId, proposal.proposalId, context.executor.address, target, proposal.value, proposal.actionSelector, proposal.dataHash, ethers.ZeroAddress);
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    expect(proposalState.status).to.equal(PROPOSAL_STATUS.executed);
    expect(await readBigInt(context.demoTarget, "number")).to.equal(77n);
    expect(await readBigInt(context.demoTarget, "lastOrgId")).to.equal(context.orgA.orgId);
  });

  it("does not emit a successful proposal receipt when direct final-target execution fails", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol({ configureDemoTarget: false });
    const failingTarget = await ethers.deployContract("ManagedExecutionTarget", [context.outsider.address]) as unknown as DeployedContract;
    const target = await failingTarget.getAddress();
    await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
    await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selectorFor(failingTarget, "setNumber(uint64,uint256)"));
    const action = createTargetAction(failingTarget, "setNumber", [context.orgA.orgId, 171n]);
    const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");
    const blockBefore = await ethers.provider.getBlockNumber();

    await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionFailed");
    await expectNoPersistedEventLogSince(blockBefore, context.govProposals, await context.govProposals.getAddress(), "ProposalExecuted");
    const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
    expect(proposalState.status).to.equal(PROPOSAL_STATUS.approved);
  });

  describe("v0.8 managed org executor", function () {
    it("configures an org-scoped executor during bootstrap and exposes it for reads", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      const orgExecutorAddress = await orgExecutor.getAddress();
      const setOrgExecutor = context.govProposals.connect(context.orgAdminA).getFunction("setOrgExecutor");

      await expect(setOrgExecutor(context.orgA.orgId, orgExecutorAddress))
        .to.emit(context.govProposals, "OrgExecutorUpdated")
        .withArgs(context.orgA.orgId, ethers.ZeroAddress, orgExecutorAddress, context.orgAdminA.address);

      expect(await readAddress(context.govProposals, "getOrgExecutor", [context.orgA.orgId])).to.equal(orgExecutorAddress);
    });

    it("executes the final target through the org executor while preserving proposal action identity", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol({ configureDemoTarget: false });
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      const orgExecutorAddress = await orgExecutor.getAddress();
      await invoke(context.govProposals.connect(context.orgAdminA), "setOrgExecutor", [context.orgA.orgId, orgExecutorAddress]);
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [orgExecutorAddress]) as unknown as DeployedContract;
      const target = await managedTarget.getAddress();
      await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
      await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selectorFor(managedTarget, "setNumber(uint64,uint256)"));
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 177n]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
        .to.emit(managedTarget, "NumberSet")
        .withArgs(context.orgA.orgId, 177n, 0n, orgExecutorAddress)
        .and.to.emit(orgExecutor, "ManagedCallExecuted")
        .withArgs(context.orgA.orgId, proposal.proposalId, target, orgExecutorAddress, 0n, proposal.actionSelector, proposal.dataHash)
        .and.to.emit(context.govProposals, "ProposalExecuted")
        .withArgs(context.orgA.orgId, proposal.proposalId, context.executor.address, target, proposal.value, proposal.actionSelector, proposal.dataHash, orgExecutorAddress);

      expect(await readAddress(managedTarget, "lastCaller")).to.equal(orgExecutorAddress);
      expect(await readAddress(managedTarget, "lastCaller")).to.not.equal(await context.govProposals.getAddress());
      expect(await readBigInt(managedTarget, "number")).to.equal(177n);
      expect(await readBigInt(managedTarget, "lastOrgId")).to.equal(context.orgA.orgId);
      expect(await readBigInt(managedTarget, "lastValue")).to.equal(0n);
      const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
      expect(proposalState.dataHash).to.equal(proposal.dataHash);
    });

    it("does not emit successful proposal or managed-call receipts when managed final-target execution fails", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol({ configureDemoTarget: false });
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      const orgExecutorAddress = await orgExecutor.getAddress();
      await invoke(context.govProposals.connect(context.orgAdminA), "setOrgExecutor", [context.orgA.orgId, orgExecutorAddress]);
      const failingTarget = await ethers.deployContract("ManagedExecutionTarget", [context.outsider.address]) as unknown as DeployedContract;
      const target = await failingTarget.getAddress();
      await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
      await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selectorFor(failingTarget, "setNumber(uint64,uint256)"));
      const action = createTargetAction(failingTarget, "setNumber", [context.orgA.orgId, 172n]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");
      const blockBefore = await ethers.provider.getBlockNumber();

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "ExecutionFailed");
      await expectNoPersistedEventLogSince(blockBefore, context.govProposals, await context.govProposals.getAddress(), "ProposalExecuted");
      await expectNoPersistedEventLogSince(blockBefore, orgExecutor, orgExecutorAddress, "ManagedCallExecuted");
      const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
      expect(proposalState.status).to.equal(PROPOSAL_STATUS.approved);
    });

    it("rejects direct executor calls from non-GovProposals callers", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 178n]);
      const executeGovernedCall = orgExecutor.connect(context.outsider).getFunction("executeGovernedCall");

      await expect(executeGovernedCall(context.orgA.orgId, 1n, await managedTarget.getAddress(), 0n, action.actionSelector, action.dataHash, action.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "Unauthorized")
        .withArgs(context.outsider.address);
    });

    it("rejects wrong org ids at the org executor boundary", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const harness = await ethers.deployContract("IsoOrgExecutorCallerHarness") as unknown as DeployedContract;
      const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await harness.getAddress(), context.orgA.orgId]) as unknown as DeployedContract;
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 179n]);
      const harnessExecute = harness.getFunction("execute");

      await expect(harnessExecute(await orgExecutor.getAddress(), context.orgB.orgId, 1n, await managedTarget.getAddress(), 0n, action.actionSelector, action.dataHash, action.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "OrgExecutorOrgMismatch")
        .withArgs(context.orgA.orgId, context.orgB.orgId);
    });

    it("rejects short calldata at the org executor boundary", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const harness = await ethers.deployContract("IsoOrgExecutorCallerHarness") as unknown as DeployedContract;
      const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await harness.getAddress(), context.orgA.orgId]) as unknown as DeployedContract;
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const shortActionData = "0x123456";
      const harnessExecute = harness.getFunction("execute");

      await expect(harnessExecute(await orgExecutor.getAddress(), context.orgA.orgId, 1n, await managedTarget.getAddress(), 0n, "0x12345678", ethers.keccak256(shortActionData), shortActionData))
        .to.be.revertedWithCustomError(orgExecutor, "InvalidExecutionCalldata");
    });

    it("rejects selector mismatches at the org executor boundary", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const harness = await ethers.deployContract("IsoOrgExecutorCallerHarness") as unknown as DeployedContract;
      const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await harness.getAddress(), context.orgA.orgId]) as unknown as DeployedContract;
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 180n]);
      const harnessExecute = harness.getFunction("execute");

      await expect(harnessExecute(await orgExecutor.getAddress(), context.orgA.orgId, 1n, await managedTarget.getAddress(), 0n, "0x12345678", action.dataHash, action.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "ActionSelectorMismatch")
        .withArgs("0x12345678", action.actionSelector);
    });

    it("rejects data hash mismatches at the org executor boundary", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const harness = await ethers.deployContract("IsoOrgExecutorCallerHarness") as unknown as DeployedContract;
      const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await harness.getAddress(), context.orgA.orgId]) as unknown as DeployedContract;
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 181n]);
      const harnessExecute = harness.getFunction("execute");

      await expect(harnessExecute(await orgExecutor.getAddress(), context.orgA.orgId, 1n, await managedTarget.getAddress(), 0n, action.actionSelector, ethers.ZeroHash, action.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "DataHashMismatch")
        .withArgs(ethers.ZeroHash, action.dataHash);
    });

    it("rejects msg.value mismatches at the org executor boundary", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const harness = await ethers.deployContract("IsoOrgExecutorCallerHarness") as unknown as DeployedContract;
      const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await harness.getAddress(), context.orgA.orgId]) as unknown as DeployedContract;
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 182n]);
      const harnessExecute = harness.getFunction("execute");

      await expect(harnessExecute(await orgExecutor.getAddress(), context.orgA.orgId, 1n, await managedTarget.getAddress(), 1n, action.actionSelector, action.dataHash, action.actionData))
        .to.be.revertedWithCustomError(orgExecutor, "InvalidExecutionValue")
        .withArgs(1n, 0n);
    });

    it("keeps final target selector and value limits enforced before managed execution", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol({ configureDemoTarget: false });
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      await invoke(context.govProposals.connect(context.orgAdminA), "setOrgExecutor", [context.orgA.orgId, await orgExecutor.getAddress()]);
      const managedTarget = await ethers.deployContract("ManagedExecutionTarget", [await orgExecutor.getAddress()]) as unknown as DeployedContract;
      const target = await managedTarget.getAddress();
      const selector = selectorFor(managedTarget, "setNumber(uint64,uint256)");
      await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
      const action = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 183n]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
        .to.be.revertedWithCustomError(context.govProposals, "ExecutionSelectorNotAllowed")
        .withArgs(context.orgA.orgId, target, selector);

      await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selector);
      await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target, 0n);
      const valueAction = createTargetAction(managedTarget, "setNumber", [context.orgA.orgId, 184n]);
      const valueProposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, valueAction, 1n);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, valueProposal.proposalId, context.orgA.bodies.councilBodyId]);

      await expect(executeProposal(context.orgA.orgId, valueProposal.proposalId, valueProposal.actionData, { value: 1n }))
        .to.be.revertedWithCustomError(context.govProposals, "ExecutionValueLimitExceeded")
        .withArgs(context.orgA.orgId, target, 0n, 1n);
    });

    it("rejects cross-org executor configuration and cross-org admin updates", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);
      const orgExecutorAddress = await orgExecutor.getAddress();

      await expect(invoke(context.govProposals.connect(context.orgAdminB), "setOrgExecutor", [context.orgA.orgId, orgExecutorAddress]))
        .to.be.revertedWithCustomError(context.govProposals, "Unauthorized")
        .withArgs(context.orgAdminB.address);
      await expect(invoke(context.govProposals.connect(context.orgAdminB), "setOrgExecutor", [context.orgB.orgId, orgExecutorAddress]))
        .to.be.revertedWithCustomError(context.govProposals, "OrgExecutorOrgMismatch")
        .withArgs(context.orgB.orgId, context.orgA.orgId);
    });

    it("rejects executor configuration for invalid organizations", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const orgExecutor = await deployOrgExecutor(context.govProposals, context.orgA.orgId);

      await expect(invoke(context.govProposals.connect(context.orgAdminA), "setOrgExecutor", [999n, await orgExecutor.getAddress()]))
        .to.be.revertedWithCustomError(context.govProposals, "OrganizationNotActive")
        .withArgs(999n);
    });
  });

  it("keeps local DemoTarget execution blocked until explicit registry configuration is set", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol({ configureDemoTarget: false });
    const target = await context.demoTarget.getAddress();
    const selector = selectorFor(context.demoTarget, "setNumber(uint64,uint256)");
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, target, 78n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]))
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionTargetNotAllowed")
      .withArgs(context.orgA.orgId, target);

    await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
    await configureExecutionSelector(context.govProposals, context.orgAdminA, context.orgA.orgId, target, selector);
    await invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]);

    expect(await readBigInt(context.demoTarget, "number")).to.equal(78n);
  });

  it("blocks execution when the target is configured but the selector is not", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const standaloneTarget = await ethers.deployContract("DemoTarget", [context.orgAdminA.address]) as unknown as DeployedContract;
    const target = await standaloneTarget.getAddress();
    await invoke(standaloneTarget.connect(context.orgAdminA), "setGovProposals", [await context.govProposals.getAddress()]);
    await configureExecutionTarget(context.govProposals, context.orgAdminA, context.orgA.orgId, target);
    const action = createTargetAction(standaloneTarget, "setNumber", [context.orgA.orgId, 79n]);
    const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]))
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionSelectorNotAllowed")
      .withArgs(context.orgA.orgId, target, selectorFor(standaloneTarget, "setNumber(uint64,uint256)"));
  });

  it("rejects execution calldata shorter than a function selector", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const target = await context.demoTarget.getAddress();
    const action = {
      actionData: "0x123456",
      actionSelector: selectorFor(context.demoTarget, "setNumber(uint64,uint256)"),
      dataHash: ethers.keccak256("0x123456"),
    };
    const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]))
      .to.be.revertedWithCustomError(context.govProposals, "InvalidExecutionCalldata");
  });

  it("rejects execution when proposal or msg.value exceeds the target limit", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const target = await context.demoTarget.getAddress();
    const action = createAction(context.demoTarget, context.orgA.orgId, 80n);
    const value = EXECUTION_TARGET_MAX_VALUE + 1n;
    const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, action, value);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

    await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData, { value }))
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionValueLimitExceeded")
      .withArgs(context.orgA.orgId, target, EXECUTION_TARGET_MAX_VALUE, value);

    const msgValueAction = createAction(context.demoTarget, context.orgA.orgId, 81n);
    const msgValueProposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, msgValueAction);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, msgValueProposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(executeProposal(context.orgA.orgId, msgValueProposal.proposalId, msgValueProposal.actionData, { value }))
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionValueLimitExceeded")
      .withArgs(context.orgA.orgId, target, EXECUTION_TARGET_MAX_VALUE, value);
  });

  describe("v0.8 accountability demo target", function () {
    it("rejects direct calls to governed target methods from non-GovProposals actors", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const feature = ethers.id("feature:v0.8:archive");
      const key = ethers.id("param:v0.8:max-review-days");
      const obligationId = ethers.id("obligation:v0.8:direct-guard");

      await expect(invoke(context.demoTarget.connect(context.outsider), "setFeatureEnabled", [context.orgA.orgId, feature, true]))
        .to.be.revertedWithCustomError(context.demoTarget, "Unauthorized")
        .withArgs(context.outsider.address);
      await expect(invoke(context.demoTarget.connect(context.outsider), "setUintParam", [context.orgA.orgId, key, 7n]))
        .to.be.revertedWithCustomError(context.demoTarget, "Unauthorized")
        .withArgs(context.outsider.address);
      const releaseNativePayment = context.demoTarget.connect(context.outsider).getFunction("releaseNativePayment");
      await expect(releaseNativePayment(context.orgA.orgId, obligationId, context.executor.address, { value: 1n }))
        .to.be.revertedWithCustomError(context.demoTarget, "Unauthorized")
        .withArgs(context.outsider.address);
      await expect(invoke(context.demoTarget.connect(context.outsider), "markObligationAccepted", [context.orgA.orgId, obligationId]))
        .to.be.revertedWithCustomError(context.demoTarget, "Unauthorized")
        .withArgs(context.outsider.address);
      await expect(invoke(context.demoTarget.connect(context.outsider), "markObligationCancelled", [context.orgA.orgId, obligationId, "scope changed"]))
        .to.be.revertedWithCustomError(context.demoTarget, "Unauthorized")
        .withArgs(context.outsider.address);
    });

    it("executes a feature flag proposal and emits proof events", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const feature = ethers.id("feature:v0.8:public-archive");
      const action = createTargetAction(context.demoTarget, "setFeatureEnabled", [context.orgA.orgId, feature, true]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), action);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
        .to.emit(context.demoTarget, "FeatureEnabledSet")
        .withArgs(context.orgA.orgId, feature, true)
        .and.to.emit(context.govProposals, "ProposalExecuted")
        .withArgs(context.orgA.orgId, proposal.proposalId, context.executor.address, await context.demoTarget.getAddress(), proposal.value, proposal.actionSelector, proposal.dataHash, ethers.ZeroAddress);

      expect(await readBoolean(context.demoTarget, "featureEnabled", [context.orgA.orgId, feature])).to.equal(true);
      const proposalState: ProposalView = await readProposal(context.govProposals, proposal.proposalId);
      expect(proposalState.status).to.equal(PROPOSAL_STATUS.executed);
    });

    it("executes an obligation acceptance proposal and emits the obligation event", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const obligationId = ethers.id("obligation:v0.8:accepted");
      const action = createTargetAction(context.demoTarget, "markObligationAccepted", [context.orgA.orgId, obligationId]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), action);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData))
        .to.emit(context.demoTarget, "ObligationAccepted")
        .withArgs(context.orgA.orgId, obligationId)
        .and.to.emit(context.govProposals, "ProposalExecuted")
        .withArgs(context.orgA.orgId, proposal.proposalId, context.executor.address, await context.demoTarget.getAddress(), proposal.value, proposal.actionSelector, proposal.dataHash, ethers.ZeroAddress);

      expect(await readBoolean(context.demoTarget, "obligationAccepted", [context.orgA.orgId, obligationId])).to.equal(true);
    });

    it("releases native value through proposal execution and emits the payment event", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const obligationId = ethers.id("obligation:v0.8:native-payment");
      const payment = ethers.parseEther("0.05");
      const action = createTargetAction(context.demoTarget, "releaseNativePayment", [context.orgA.orgId, obligationId, context.outsider.address]);
      const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, await context.demoTarget.getAddress(), action, payment);
      await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
      const recipientBalanceBefore = await ethers.provider.getBalance(context.outsider.address);
      const executeProposal = context.govProposals.connect(context.executor).getFunction("executeProposal");

      await expect(executeProposal(context.orgA.orgId, proposal.proposalId, proposal.actionData, { value: payment }))
        .to.emit(context.demoTarget, "NativePaymentReleased")
        .withArgs(context.orgA.orgId, obligationId, context.outsider.address, payment)
        .and.to.emit(context.govProposals, "ProposalExecuted")
        .withArgs(context.orgA.orgId, proposal.proposalId, context.executor.address, await context.demoTarget.getAddress(), proposal.value, proposal.actionSelector, proposal.dataHash, ethers.ZeroAddress);

      expect(await ethers.provider.getBalance(context.outsider.address)).to.equal(recipientBalanceBefore + payment);
    });

    it("rejects a zero recipient for native payment release", async function (): Promise<void> {
      const context: ProtocolContext = await deployProtocol();
      const obligationId = ethers.id("obligation:v0.8:zero-recipient");
      const standaloneTarget = await ethers.deployContract("DemoTarget", [context.orgAdminA.address]) as unknown as DeployedContract;
      await invoke(standaloneTarget.connect(context.orgAdminA), "setGovProposals", [context.executor.address]);
      const releaseNativePayment = standaloneTarget.connect(context.executor).getFunction("releaseNativePayment");

      await expect(releaseNativePayment(context.orgA.orgId, obligationId, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(standaloneTarget, "ZeroAddress");
    });
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

  it("blocks execution when calldata selector differs from the proposal action selector", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const target = await context.demoTarget.getAddress();
    const action = createAction(context.demoTarget, context.orgA.orgId, 332n);
    const mismatchedAction: ProposalAction = {
      ...action,
      actionSelector: selectorFor(context.demoTarget, "setFeatureEnabled(uint64,bytes32,bool)"),
    };
    const proposal = await createProposalForAction(context, PROPOSAL_TYPE.standard, target, mismatchedAction);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, action.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "ActionSelectorMismatch")
      .withArgs(mismatchedAction.actionSelector, action.actionSelector);
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

  it("blocks execution to an unconfigured target", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, context.outsider.address, 555n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);
    await expect(
      invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]),
    )
      .to.be.revertedWithCustomError(context.govProposals, "ExecutionTargetNotAllowed")
      .withArgs(context.orgA.orgId, context.outsider.address);
  });

  it("rejects zero execution target addresses", async function (): Promise<void> {
    const context: ProtocolContext = await deployProtocol();
    const selector = selectorFor(context.demoTarget, "setNumber(uint64,uint256)");

    await expect(invoke(context.govProposals.connect(context.orgAdminA), "setExecutionTargetRule", [context.orgA.orgId, ethers.ZeroAddress, true, 0n]))
      .to.be.revertedWithCustomError(context.govProposals, "ZeroAddress");
    await expect(invoke(context.govProposals.connect(context.orgAdminA), "setExecutionSelectorRule", [context.orgA.orgId, ethers.ZeroAddress, selector, true]))
      .to.be.revertedWithCustomError(context.govProposals, "ZeroAddress");

    const proposal = await createProposal(context, PROPOSAL_TYPE.standard, ethers.ZeroAddress, 556n);
    await invoke(context.govProposals.connect(context.councilApprover), "approveProposal", [context.orgA.orgId, proposal.proposalId, context.orgA.bodies.councilBodyId]);

    await expect(invoke(context.govProposals.connect(context.executor), "executeProposal", [context.orgA.orgId, proposal.proposalId, proposal.actionData]))
      .to.be.revertedWithCustomError(context.govProposals, "ZeroAddress");
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
