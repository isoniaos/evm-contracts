import { expect } from "chai";
import { network } from "hardhat";
import type { BaseContract } from "ethers";

const hardhatRuntime: Awaited<ReturnType<typeof network.create>> = await network.create();
const { ethers } = hardhatRuntime;
type EthersHelpers = typeof ethers;
type DeployedContract = BaseContract;
type SignerWithAddress = Awaited<ReturnType<EthersHelpers["getSigners"]>>[number];

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

interface ProposalView {
  readonly status: bigint;
  readonly executableAt: bigint;
}

type BodyCreateInput = [bigint, string];
type RoleCreateInput = [bigint, bigint, string];
type MandateAssignInput = [bigint, string, bigint, bigint, bigint, bigint];
type PolicyRuleSetInput = [bigint, bigint[], bigint[], bigint, bigint, boolean];

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

async function invoke(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<void> {
  const method = contract.getFunction(methodName);
  await method(...args);
}

async function readProposal(govProposals: DeployedContract, proposalId: bigint): Promise<ProposalView> {
  const method = govProposals.getFunction("proposals");
  const proposal = await method(proposalId) as { status: bigint; executableAt: bigint };
  return { status: proposal.status, executableAt: proposal.executableAt };
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
