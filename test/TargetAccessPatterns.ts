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
  emergencyCouncil: 6n,
} as const;

const ROLE_TYPE = {
  proposer: 3n,
  approver: 4n,
  executor: 6n,
} as const;

const PROPOSAL_TYPE = {
  standard: 1n,
  emergency: 4n,
} as const;

const PROPOSAL_STATUS = {
  approved: 3n,
  executed: 6n,
} as const;

const TARGET_MAX_VALUE = ethers.parseEther("1");
const OWNABLE_TARGET_CONTRACT = "contracts/demo/targets/IsoOwnableTarget.sol:IsoOwnableTarget";
const ACCESS_CONTROL_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessControlTarget.sol:IsoAccessControlTarget";
const ACCESS_MANAGER_CONTRACT = "contracts/demo/targets/IsoDemoAccessManager.sol:IsoDemoAccessManager";
const ACCESS_MANAGED_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessManagedTarget.sol:IsoAccessManagedTarget";
const ACCESS_MANAGER_OPERATOR_ROLE = 42n;

interface AccessPatternContext {
  readonly isoCore: DeployedContract;
  readonly isoProposals: DeployedContract;
  readonly orgExecutor: DeployedContract;
  readonly orgExecutorAddress: string;
  readonly orgId: bigint;
  readonly standardBodyId: bigint;
  readonly emergencyBodyId: bigint;
  readonly admin: SignerWithAddress;
  readonly proposer: SignerWithAddress;
  readonly approver: SignerWithAddress;
  readonly executor: SignerWithAddress;
  readonly emergencyProposer: SignerWithAddress;
  readonly emergencyApprover: SignerWithAddress;
  readonly emergencyExecutor: SignerWithAddress;
  readonly outsider: SignerWithAddress;
}

interface ProposalAction {
  readonly actionData: string;
  readonly actionSelector: string;
  readonly dataHash: string;
}

interface CreatedProposal extends ProposalAction {
  readonly proposalId: bigint;
}

interface ProposalView {
  readonly status: bigint;
}

function selectorFromActionData(actionData: string): string {
  if (actionData.length < 10) {
    throw new Error("Action data is shorter than a function selector");
  }
  return `0x${actionData.slice(2, 10)}`;
}

function actionFor(target: DeployedContract, methodName: string, args: readonly unknown[]): ProposalAction {
  const actionData: string = target.interface.encodeFunctionData(methodName, args);
  return {
    actionData,
    actionSelector: selectorFromActionData(actionData),
    dataHash: ethers.keccak256(actionData),
  };
}

function selectorFor(target: DeployedContract, signature: string): string {
  const fragment = target.interface.getFunction(signature);
  if (fragment === null) {
    throw new Error(`Unknown function signature: ${signature}`);
  }
  return fragment.selector;
}

async function readBigInt(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<bigint> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as bigint;
}

async function readAddress(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<string> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as string;
}

async function readBoolean(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<boolean> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as boolean;
}

async function readProposal(isoProposals: DeployedContract, proposalId: bigint): Promise<ProposalView> {
  const method = isoProposals.getFunction("proposals");
  const proposal = await method(proposalId) as { status: bigint };
  return { status: proposal.status };
}

async function invoke(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<void> {
  const method = contract.getFunction(methodName);
  await method(...args);
}

async function grantIsoniaRole(
  isoCore: DeployedContract,
  admin: SignerWithAddress,
  orgId: bigint,
  bodyId: bigint,
  roleType: bigint,
  holder: SignerWithAddress,
  proposalType: bigint,
): Promise<void> {
  const roleId = await readBigInt(isoCore, "nextRoleId");
  await invoke(isoCore.connect(admin), "createRole", [orgId, bodyId, roleType, `ipfs://target-role-${roleId}`]);
  await invoke(isoCore.connect(admin), "assignMandate", [orgId, roleId, holder.address, 0n, 0n, 1n << proposalType, 0n]);
}

async function deployAccessPatternContext(slug: string): Promise<AccessPatternContext> {
  const [
    ,
    admin,
    proposer,
    approver,
    executor,
    emergencyProposer,
    emergencyApprover,
    emergencyExecutor,
    outsider,
  ]: SignerWithAddress[] = await ethers.getSigners();
  const isoCore = await ethers.deployContract("IsoCore") as unknown as DeployedContract;
  const isoProposals = await ethers.deployContract("IsoProposals", [await isoCore.getAddress()]) as unknown as DeployedContract;

  const orgId = await readBigInt(isoCore, "nextOrgId");
  await invoke(isoCore, "createOrganization", [slug, `ipfs://${slug}`, admin.address]);
  const standardBodyId = await readBigInt(isoCore, "nextBodyId");
  await invoke(isoCore.connect(admin), "createBody", [orgId, BODY_KIND.generalCouncil, `ipfs://${slug}-standard-body`]);
  const emergencyBodyId = await readBigInt(isoCore, "nextBodyId");
  await invoke(isoCore.connect(admin), "createBody", [orgId, BODY_KIND.emergencyCouncil, `ipfs://${slug}-emergency-body`]);

  await grantIsoniaRole(isoCore, admin, orgId, standardBodyId, ROLE_TYPE.proposer, proposer, PROPOSAL_TYPE.standard);
  await grantIsoniaRole(isoCore, admin, orgId, standardBodyId, ROLE_TYPE.approver, approver, PROPOSAL_TYPE.standard);
  await grantIsoniaRole(isoCore, admin, orgId, standardBodyId, ROLE_TYPE.executor, executor, PROPOSAL_TYPE.standard);
  await grantIsoniaRole(isoCore, admin, orgId, emergencyBodyId, ROLE_TYPE.proposer, emergencyProposer, PROPOSAL_TYPE.emergency);
  await grantIsoniaRole(isoCore, admin, orgId, emergencyBodyId, ROLE_TYPE.approver, emergencyApprover, PROPOSAL_TYPE.emergency);
  await grantIsoniaRole(isoCore, admin, orgId, emergencyBodyId, ROLE_TYPE.executor, emergencyExecutor, PROPOSAL_TYPE.emergency);

  await invoke(isoCore.connect(admin), "setPolicyRule", [orgId, PROPOSAL_TYPE.standard, [standardBodyId], [], standardBodyId, 0n, true]);
  await invoke(isoCore.connect(admin), "setPolicyRule", [orgId, PROPOSAL_TYPE.emergency, [emergencyBodyId], [], emergencyBodyId, 0n, true]);

  const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await isoProposals.getAddress(), orgId]) as unknown as DeployedContract;
  const orgExecutorAddress = await orgExecutor.getAddress();
  await invoke(isoProposals.connect(admin), "setOrgExecutor", [orgId, orgExecutorAddress]);

  return {
    isoCore,
    isoProposals,
    orgExecutor,
    orgExecutorAddress,
    orgId,
    standardBodyId,
    emergencyBodyId,
    admin,
    proposer,
    approver,
    executor,
    emergencyProposer,
    emergencyApprover,
    emergencyExecutor,
    outsider,
  };
}

async function configureTargetSelector(
  context: AccessPatternContext,
  target: DeployedContract,
  selector: string,
): Promise<void> {
  await invoke(context.isoProposals.connect(context.admin), "setExecutionTargetRule", [context.orgId, await target.getAddress(), true, TARGET_MAX_VALUE]);
  await invoke(context.isoProposals.connect(context.admin), "setExecutionSelectorRule", [context.orgId, await target.getAddress(), selector, true]);
}

async function createProposal(
  context: AccessPatternContext,
  target: DeployedContract,
  proposalType: bigint,
  action: ProposalAction,
  proposer: SignerWithAddress,
): Promise<CreatedProposal> {
  const proposalId = await readBigInt(context.isoProposals, "nextProposalId");
  await invoke(context.isoProposals.connect(proposer), "createProposal", [
    context.orgId,
    proposalType,
    await target.getAddress(),
    0n,
    action.actionSelector,
    action.dataHash,
    `ipfs://target-access-proposal-${proposalId}`,
  ]);
  return { proposalId, ...action };
}

async function approveProposal(
  context: AccessPatternContext,
  proposalId: bigint,
  proposalType: bigint,
): Promise<void> {
  if (proposalType === PROPOSAL_TYPE.emergency) {
    await invoke(context.isoProposals.connect(context.emergencyApprover), "approveProposal", [context.orgId, proposalId, context.emergencyBodyId]);
    return;
  }
  await invoke(context.isoProposals.connect(context.approver), "approveProposal", [context.orgId, proposalId, context.standardBodyId]);
}

async function executeProposal(
  context: AccessPatternContext,
  proposal: CreatedProposal,
  proposalType: bigint,
): Promise<void> {
  const executor = proposalType === PROPOSAL_TYPE.emergency ? context.emergencyExecutor : context.executor;
  await invoke(context.isoProposals.connect(executor), "executeProposal", [context.orgId, proposal.proposalId, proposal.actionData]);
}

async function createApprovedProposal(
  context: AccessPatternContext,
  target: DeployedContract,
  proposalType: bigint,
  action: ProposalAction,
  proposer: SignerWithAddress,
): Promise<CreatedProposal> {
  const proposal = await createProposal(context, target, proposalType, action, proposer);
  await approveProposal(context, proposal.proposalId, proposalType);
  return proposal;
}

describe("demo-local access-control target patterns", function () {
  it("hands an Ownable target to IsoOrgExecutor and executes only through the governed route", async function (): Promise<void> {
    const context = await deployAccessPatternContext("ownable-target-org");
    const target = await ethers.deployContract(OWNABLE_TARGET_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    const targetAddress = await target.getAddress();
    await invoke(target.connect(context.admin), "transferOwnership", [context.orgExecutorAddress]);
    await configureTargetSelector(context, target, selectorFor(target, "setNumber(uint64,uint256)"));
    const action = actionFor(target, "setNumber", [context.orgId, 123n]);
    const proposal = await createApprovedProposal(context, target, PROPOSAL_TYPE.standard, action, context.proposer);

    await expect(invoke(target.connect(context.admin), "setNumber", [context.orgId, 999n]))
      .to.be.revertedWithCustomError(target, "OwnableUnauthorizedAccount")
      .withArgs(context.admin.address);

    const execute = context.isoProposals.connect(context.executor).getFunction("executeProposal");
    await expect(execute(context.orgId, proposal.proposalId, proposal.actionData))
      .to.emit(target, "NumberSet")
      .withArgs(context.orgId, 123n, context.orgExecutorAddress)
      .and.to.emit(context.isoProposals, "ProposalExecuted")
      .withArgs(context.orgId, proposal.proposalId, context.executor.address, targetAddress, 0n, proposal.actionSelector, proposal.dataHash, context.orgExecutorAddress);

    expect(await readAddress(target, "owner")).to.equal(context.orgExecutorAddress);
    expect(await readAddress(target, "lastCaller")).to.equal(context.orgExecutorAddress);
    expect(await readBigInt(target, "number")).to.equal(123n);
  });

  it("executes an AccessControl target call when the target role is granted to IsoOrgExecutor", async function (): Promise<void> {
    const context = await deployAccessPatternContext("access-control-target-org");
    const target = await ethers.deployContract(ACCESS_CONTROL_TARGET_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    const operatorRole = await target.getFunction("OPERATOR_ROLE")();
    await invoke(target.connect(context.admin), "grantRole", [operatorRole, context.orgExecutorAddress]);
    await configureTargetSelector(context, target, selectorFor(target, "setNumber(uint64,uint256)"));
    const action = actionFor(target, "setNumber", [context.orgId, 456n]);
    const proposal = await createApprovedProposal(context, target, PROPOSAL_TYPE.standard, action, context.proposer);

    await executeProposal(context, proposal, PROPOSAL_TYPE.standard);

    expect(await readBigInt(target, "number")).to.equal(456n);
    expect(await readAddress(target, "lastCaller")).to.equal(context.orgExecutorAddress);
  });

  it("fails visibly when the AccessControl target role is not granted to IsoOrgExecutor", async function (): Promise<void> {
    const context = await deployAccessPatternContext("access-control-missing-role-org");
    const target = await ethers.deployContract(ACCESS_CONTROL_TARGET_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    await configureTargetSelector(context, target, selectorFor(target, "setNumber(uint64,uint256)"));
    const action = actionFor(target, "setNumber", [context.orgId, 789n]);
    const proposal = await createApprovedProposal(context, target, PROPOSAL_TYPE.standard, action, context.proposer);

    await expect(executeProposal(context, proposal, PROPOSAL_TYPE.standard))
      .to.be.revertedWithCustomError(context.isoProposals, "ExecutionFailed");

    expect(await readBigInt(target, "number")).to.equal(0n);
    expect((await readProposal(context.isoProposals, proposal.proposalId)).status).to.equal(PROPOSAL_STATUS.approved);
  });

  it("enforces AccessManager selector roles for AccessManaged targets", async function (): Promise<void> {
    const context = await deployAccessPatternContext("access-manager-target-org");
    const accessManager = await ethers.deployContract(ACCESS_MANAGER_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    const target = await ethers.deployContract(ACCESS_MANAGED_TARGET_CONTRACT, [await accessManager.getAddress()]) as unknown as DeployedContract;
    const targetAddress = await target.getAddress();
    const setNumberSelector = selectorFor(target, "setNumber(uint64,uint256)");
    const unconfiguredSelector = selectorFor(target, "unconfiguredAction(uint64)");

    await invoke(accessManager.connect(context.admin), "setTargetFunctionRole", [targetAddress, [setNumberSelector], ACCESS_MANAGER_OPERATOR_ROLE]);
    await invoke(accessManager.connect(context.admin), "grantRole", [ACCESS_MANAGER_OPERATOR_ROLE, context.orgExecutorAddress, 0]);
    await configureTargetSelector(context, target, setNumberSelector);
    await configureTargetSelector(context, target, unconfiguredSelector);

    const allowedAction = actionFor(target, "setNumber", [context.orgId, 321n]);
    const allowedProposal = await createApprovedProposal(context, target, PROPOSAL_TYPE.standard, allowedAction, context.proposer);
    await executeProposal(context, allowedProposal, PROPOSAL_TYPE.standard);

    expect(await readBigInt(target, "number")).to.equal(321n);
    expect(await readAddress(target, "lastCaller")).to.equal(context.orgExecutorAddress);

    const rejectedAction = actionFor(target, "unconfiguredAction", [context.orgId]);
    const rejectedProposal = await createApprovedProposal(context, target, PROPOSAL_TYPE.standard, rejectedAction, context.proposer);
    await expect(executeProposal(context, rejectedProposal, PROPOSAL_TYPE.standard))
      .to.be.revertedWithCustomError(context.isoProposals, "ExecutionFailed");
  });

  it("executes a zero-timelock emergency route only for the explicitly allowed selector and target", async function (): Promise<void> {
    const context = await deployAccessPatternContext("emergency-access-control-org");
    const target = await ethers.deployContract(ACCESS_CONTROL_TARGET_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    const emergencyRole = await target.getFunction("EMERGENCY_ROLE")();
    await invoke(target.connect(context.admin), "grantRole", [emergencyRole, context.orgExecutorAddress]);
    const emergencySelector = selectorFor(target, "setEmergencyPause(uint64,bool)");
    await configureTargetSelector(context, target, emergencySelector);

    const emergencyAction = actionFor(target, "setEmergencyPause", [context.orgId, true]);
    const emergencyProposal = await createApprovedProposal(
      context,
      target,
      PROPOSAL_TYPE.emergency,
      emergencyAction,
      context.emergencyProposer,
    );

    await executeProposal(context, emergencyProposal, PROPOSAL_TYPE.emergency);

    expect(await readBoolean(target, "emergencyPaused")).to.equal(true);
    expect((await readProposal(context.isoProposals, emergencyProposal.proposalId)).status).to.equal(PROPOSAL_STATUS.executed);

    const nonEmergencyAction = actionFor(target, "setNumber", [context.orgId, 654n]);
    const nonEmergencyProposal = await createApprovedProposal(
      context,
      target,
      PROPOSAL_TYPE.emergency,
      nonEmergencyAction,
      context.emergencyProposer,
    );
    await expect(executeProposal(context, nonEmergencyProposal, PROPOSAL_TYPE.emergency))
      .to.be.revertedWithCustomError(context.isoProposals, "ExecutionSelectorNotAllowed")
      .withArgs(context.orgId, await target.getAddress(), nonEmergencyAction.actionSelector);

    const arbitraryTarget = await ethers.deployContract(OWNABLE_TARGET_CONTRACT, [context.admin.address]) as unknown as DeployedContract;
    const arbitraryAction = actionFor(arbitraryTarget, "setEmergencyPause", [context.orgId, true]);
    const arbitraryProposal = await createApprovedProposal(
      context,
      arbitraryTarget,
      PROPOSAL_TYPE.emergency,
      arbitraryAction,
      context.emergencyProposer,
    );
    await expect(executeProposal(context, arbitraryProposal, PROPOSAL_TYPE.emergency))
      .to.be.revertedWithCustomError(context.isoProposals, "ExecutionTargetNotAllowed")
      .withArgs(context.orgId, await arbitraryTarget.getAddress());
  });
});
