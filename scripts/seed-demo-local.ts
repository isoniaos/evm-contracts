import { network } from "hardhat";
import { resolveDemoLocalContractAddresses } from "./demo-local-addresses.js";

const { ethers } = await network.getOrCreate();

const BODY_KIND = {
  generalCouncil: 1n,
  treasuryCommittee: 2n,
  securityCouncil: 3n,
  capitalHouse: 4n,
  meritHouse: 5n,
  emergencyCouncil: 6n,
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
  upgrade: 3n,
  emergency: 4n,
} as const;

const DEMO_TARGET_MAX_VALUE = ethers.parseEther("1");
const DEMO_TARGET_FUNCTIONS = [
  "setNumber(uint64,uint256)",
  "setFeatureEnabled(uint64,bytes32,bool)",
  "setUintParam(uint64,bytes32,uint256)",
  "releaseNativePayment(uint64,bytes32,address)",
  "markObligationAccepted(uint64,bytes32)",
  "markObligationCancelled(uint64,bytes32,string)",
] as const;
const DEMO_TARGET_CONTRACT = "contracts/demo/DemoTarget.sol:DemoTarget";
const DEMO_VOTES_TOKEN_CONTRACT = "contracts/demo/IsoDemoVotesToken.sol:IsoDemoVotesToken";
const DEMO_OWNABLE_TARGET_CONTRACT = "contracts/demo/targets/IsoOwnableTarget.sol:IsoOwnableTarget";
const DEMO_ACCESS_CONTROL_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessControlTarget.sol:IsoAccessControlTarget";
const DEMO_ACCESS_MANAGER_CONTRACT = "contracts/demo/targets/IsoDemoAccessManager.sol:IsoDemoAccessManager";
const DEMO_ACCESS_MANAGED_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessManagedTarget.sol:IsoAccessManagedTarget";
const ACCESS_MANAGER_OPERATOR_ROLE = 42n;

function mask(proposalType: bigint): bigint {
  return 1n << proposalType;
}

function selectorFromActionData(actionData: string): string {
  if (actionData.length < 10) {
    throw new Error("Action data is shorter than a function selector");
  }
  return `0x${actionData.slice(2, 10)}`;
}

async function main(): Promise<void> {
  const [deployer, simpleAdmin, bicameralAdmin, proposer, approverA, approverB, vetoer, executor] = await ethers.getSigners();
  const {
    isoCore,
    isoProposals,
    demoTarget,
    demoVotesToken,
    demoOwnableTarget,
    demoAccessControlTarget,
    demoAccessManager,
    demoAccessManagedTarget,
  } = await resolveProtocolContracts();

  const simple = await createSimpleDaoPlus({
    isoCore,
    isoProposals,
    demoTarget,
    admin: simpleAdmin,
    proposer,
    councilApprover: approverA,
    treasuryApprover: approverB,
    vetoer,
    executor,
  });

  const bicameral = await createBicameralPreview({
    isoCore,
    isoProposals,
    demoTarget,
    admin: bicameralAdmin,
    proposer,
    capitalApprover: approverA,
    meritApprover: approverB,
    vetoer,
    executor,
  });

  const ownableTarget = await createOwnableTargetOrganization({
    isoCore,
    isoProposals,
    demoOwnableTarget,
    targetAdmin: deployer,
    admin: simpleAdmin,
    proposer,
    approver: approverA,
    executor,
  });

  const accessControlTarget = await createAccessControlTargetOrganization({
    isoCore,
    isoProposals,
    demoAccessControlTarget,
    targetAdmin: deployer,
    admin: bicameralAdmin,
    emergencyProposer: proposer,
    emergencyApprover: approverB,
    emergencyExecutor: executor,
  });

  const accessManagerTarget = await createAccessManagerTargetOrganization({
    isoCore,
    isoProposals,
    demoAccessManager,
    demoAccessManagedTarget,
    targetAdmin: deployer,
    admin: simpleAdmin,
    proposer,
    approver: approverA,
    executor,
  });

  const demoVotes = demoVotesToken === undefined
    ? undefined
    : await seedDemoVotesToken({
      demoVotesToken,
      holders: { proposer, approverA, approverB, executor },
    });

  console.log(JSON.stringify({
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contracts: {
      isoCore: await isoCore.getAddress(),
      isoProposals: await isoProposals.getAddress(),
      demoTarget: await demoTarget.getAddress(),
      ...(demoVotesToken === undefined ? {} : { demoVotesToken: await demoVotesToken.getAddress() }),
      demoOwnableTarget: await demoOwnableTarget.getAddress(),
      demoAccessControlTarget: await demoAccessControlTarget.getAddress(),
      demoAccessManager: await demoAccessManager.getAddress(),
      demoAccessManagedTarget: await demoAccessManagedTarget.getAddress(),
    },
    sampleAccounts: {
      deployer: deployer.address,
      simpleAdmin: simpleAdmin.address,
      bicameralAdmin: bicameralAdmin.address,
      proposer: proposer.address,
      approverA: approverA.address,
      approverB: approverB.address,
      vetoer: vetoer.address,
      executor: executor.address,
    },
    organizations: { simple, bicameral, ownableTarget, accessControlTarget, accessManagerTarget },
    ...(demoVotes === undefined ? {} : { demoVotes }),
  }, null, 2));
}

async function createSimpleDaoPlus(context: any) {
  const { isoCore, isoProposals, demoTarget, admin, proposer, councilApprover, treasuryApprover, vetoer, executor } = context;
  const orgId = await nextId(isoCore, "nextOrgId");
  await (await isoCore.createOrganization("simple-dao-plus", "ipfs://simple-dao-plus", admin.address)).wait();
  const council = await createBody(isoCore, admin, orgId, BODY_KIND.generalCouncil, "ipfs://simple-general-council");
  const treasury = await createBody(isoCore, admin, orgId, BODY_KIND.treasuryCommittee, "ipfs://simple-treasury-committee");
  const security = await createBody(isoCore, admin, orgId, BODY_KIND.securityCouncil, "ipfs://simple-security-council");

  await grant(isoCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.approver, councilApprover.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.approver, councilApprover.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, treasury, ROLE_TYPE.approver, treasuryApprover.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, security, ROLE_TYPE.vetoer, vetoer.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.treasury);

  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.standard, [council], [], council, 0, true)).wait();
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.treasury, [council, treasury], [security], council, 3600, true)).wait();
  const demoExecutionTarget = await configureDemoTargetExecutionRules(isoProposals, demoTarget, admin, orgId);

  const standardProposalId = await createDemoProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, 101n);
  const treasuryProposalId = await createDemoProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.treasury, 202n);
  const executedFeatureProposal = await createExecutedFeatureProposal({
    isoProposals,
    demoTarget,
    proposer,
    approver: councilApprover,
    executor,
    orgId,
    approvalBodyId: council,
  });
  const pendingObligationProposal = await createApprovedPendingObligationProposal({
    isoProposals,
    demoTarget,
    proposer,
    approver: councilApprover,
    orgId,
    approvalBodyId: council,
  });

  return {
    orgId: orgId.toString(),
    bodies: { council: council.toString(), treasury: treasury.toString(), security: security.toString() },
    proposals: {
      standardProposalId: standardProposalId.toString(),
      treasuryProposalId: treasuryProposalId.toString(),
      executedFeatureProposalId: executedFeatureProposal.proposalId.toString(),
      pendingObligationProposalId: pendingObligationProposal.proposalId.toString(),
    },
    accountability: { executedFeatureProposal, pendingObligationProposal },
    executionTargets: { demoTarget: demoExecutionTarget },
  };
}

async function createBicameralPreview(context: any) {
  const { isoCore, isoProposals, demoTarget, admin, proposer, capitalApprover, meritApprover, vetoer, executor } = context;
  const orgId = await nextId(isoCore, "nextOrgId");
  await (await isoCore.createOrganization("bicameral-preview", "ipfs://bicameral-preview", admin.address)).wait();
  const capital = await createBody(isoCore, admin, orgId, BODY_KIND.capitalHouse, "ipfs://capital-house");
  const merit = await createBody(isoCore, admin, orgId, BODY_KIND.meritHouse, "ipfs://merit-house");
  const emergency = await createBody(isoCore, admin, orgId, BODY_KIND.emergencyCouncil, "ipfs://emergency-council");

  await grant(isoCore, admin, orgId, capital, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, merit, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.upgrade);
  await grant(isoCore, admin, orgId, capital, ROLE_TYPE.approver, capitalApprover.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, merit, ROLE_TYPE.approver, meritApprover.address, PROPOSAL_TYPE.upgrade);
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.vetoer, vetoer.address, PROPOSAL_TYPE.upgrade);
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.approver, meritApprover.address, PROPOSAL_TYPE.emergency);
  await grant(isoCore, admin, orgId, capital, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.treasury);
  await grant(isoCore, admin, orgId, merit, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.upgrade);
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.emergency);

  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.treasury, [capital], [], capital, 0, true)).wait();
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.upgrade, [merit], [emergency], merit, 7200, true)).wait();
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.emergency, [emergency], [], emergency, 0, true)).wait();
  const demoExecutionTarget = await configureDemoTargetExecutionRules(isoProposals, demoTarget, admin, orgId);

  const treasuryProposalId = await createDemoProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.treasury, 303n);
  const upgradeProposalId = await createDemoProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.upgrade, 404n);

  return {
    orgId: orgId.toString(),
    bodies: { capital: capital.toString(), merit: merit.toString(), emergency: emergency.toString() },
    proposals: { treasuryProposalId: treasuryProposalId.toString(), upgradeProposalId: upgradeProposalId.toString() },
    executionTargets: { demoTarget: demoExecutionTarget },
  };
}

async function createOwnableTargetOrganization(context: any) {
  const { isoCore, isoProposals, demoOwnableTarget, targetAdmin, admin, proposer, approver, executor } = context;
  const orgId = await nextId(isoCore, "nextOrgId");
  await (await isoCore.createOrganization("ownable-target-local", "ipfs://ownable-target-local", admin.address)).wait();
  const council = await createBody(isoCore, admin, orgId, BODY_KIND.generalCouncil, "ipfs://ownable-target-council");
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.approver, approver.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.standard);
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.standard, [council], [], council, 0, true)).wait();

  const orgExecutor = await createOrgExecutor(isoProposals, admin, orgId);
  await (await demoOwnableTarget.connect(targetAdmin).transferOwnership(orgExecutor.address)).wait();
  const executionTarget = await configureTargetExecutionRules(isoProposals, demoOwnableTarget, admin, orgId, [
    "setNumber(uint64,uint256)",
  ]);
  const actionData = demoOwnableTarget.interface.encodeFunctionData("setNumber", [orgId, 501n]);
  const proposalId = await createTargetProposal(isoProposals, demoOwnableTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await isoProposals.connect(approver).approveProposal(orgId, proposalId, council)).wait();
  await (await isoProposals.connect(executor).executeProposal(orgId, proposalId, actionData)).wait();

  return {
    orgId: orgId.toString(),
    bodies: { council: council.toString() },
    orgExecutor: orgExecutor.address,
    target: await demoOwnableTarget.getAddress(),
    targetOwner: await demoOwnableTarget.owner(),
    executedProposalId: proposalId.toString(),
    executionTargets: { ownableTarget: executionTarget },
  };
}

async function createAccessControlTargetOrganization(context: any) {
  const { isoCore, isoProposals, demoAccessControlTarget, targetAdmin, admin, emergencyProposer, emergencyApprover, emergencyExecutor } = context;
  const orgId = await nextId(isoCore, "nextOrgId");
  await (await isoCore.createOrganization("access-control-target-local", "ipfs://access-control-target-local", admin.address)).wait();
  const emergency = await createBody(isoCore, admin, orgId, BODY_KIND.emergencyCouncil, "ipfs://access-control-emergency-council");
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.proposer, emergencyProposer.address, PROPOSAL_TYPE.emergency);
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.approver, emergencyApprover.address, PROPOSAL_TYPE.emergency);
  await grant(isoCore, admin, orgId, emergency, ROLE_TYPE.executor, emergencyExecutor.address, PROPOSAL_TYPE.emergency);
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.emergency, [emergency], [], emergency, 0, true)).wait();

  const orgExecutor = await createOrgExecutor(isoProposals, admin, orgId);
  const emergencyRole = await demoAccessControlTarget.EMERGENCY_ROLE();
  await (await demoAccessControlTarget.connect(targetAdmin).grantRole(emergencyRole, orgExecutor.address)).wait();
  const executionTarget = await configureTargetExecutionRules(isoProposals, demoAccessControlTarget, admin, orgId, [
    "setEmergencyPause(uint64,bool)",
  ]);
  const actionData = demoAccessControlTarget.interface.encodeFunctionData("setEmergencyPause", [orgId, true]);
  const actionSelector = selectorFromActionData(actionData);
  const proposalId = await createTargetProposal(isoProposals, demoAccessControlTarget, emergencyProposer, orgId, PROPOSAL_TYPE.emergency, actionData);
  await (await isoProposals.connect(emergencyApprover).approveProposal(orgId, proposalId, emergency)).wait();
  await (await isoProposals.connect(emergencyExecutor).executeProposal(orgId, proposalId, actionData)).wait();

  return {
    orgId: orgId.toString(),
    bodies: { emergency: emergency.toString() },
    orgExecutor: orgExecutor.address,
    target: await demoAccessControlTarget.getAddress(),
    emergencyRole,
    emergencyPolicy: { proposalType: "emergency", timelockSeconds: "0", selector: actionSelector },
    executedEmergencyProposalId: proposalId.toString(),
    executionTargets: { accessControlTarget: executionTarget },
  };
}

async function createAccessManagerTargetOrganization(context: any) {
  const { isoCore, isoProposals, demoAccessManager, demoAccessManagedTarget, targetAdmin, admin, proposer, approver, executor } = context;
  const orgId = await nextId(isoCore, "nextOrgId");
  await (await isoCore.createOrganization("access-manager-target-local", "ipfs://access-manager-target-local", admin.address)).wait();
  const council = await createBody(isoCore, admin, orgId, BODY_KIND.generalCouncil, "ipfs://access-manager-target-council");
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.approver, approver.address, PROPOSAL_TYPE.standard);
  await grant(isoCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.standard);
  await (await isoCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.standard, [council], [], council, 0, true)).wait();

  const orgExecutor = await createOrgExecutor(isoProposals, admin, orgId);
  const target = await demoAccessManagedTarget.getAddress();
  const setNumberSelector = selectorFor(demoAccessManagedTarget, "setNumber(uint64,uint256)");
  await (await demoAccessManager.connect(targetAdmin).setTargetFunctionRole(target, [setNumberSelector], ACCESS_MANAGER_OPERATOR_ROLE)).wait();
  await (await demoAccessManager.connect(targetAdmin).grantRole(ACCESS_MANAGER_OPERATOR_ROLE, orgExecutor.address, 0)).wait();
  const executionTarget = await configureTargetExecutionRules(isoProposals, demoAccessManagedTarget, admin, orgId, [
    "setNumber(uint64,uint256)",
  ]);
  const actionData = demoAccessManagedTarget.interface.encodeFunctionData("setNumber", [orgId, 601n]);
  const proposalId = await createTargetProposal(isoProposals, demoAccessManagedTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await isoProposals.connect(approver).approveProposal(orgId, proposalId, council)).wait();
  await (await isoProposals.connect(executor).executeProposal(orgId, proposalId, actionData)).wait();

  return {
    orgId: orgId.toString(),
    bodies: { council: council.toString() },
    orgExecutor: orgExecutor.address,
    target,
    accessManager: await demoAccessManager.getAddress(),
    accessManagerRole: ACCESS_MANAGER_OPERATOR_ROLE.toString(),
    executedProposalId: proposalId.toString(),
    executionTargets: { accessManagedTarget: executionTarget },
  };
}

async function nextId(contract: any, methodName: string): Promise<bigint> {
  return await contract.getFunction(methodName)();
}

async function createBody(isoCore: any, admin: any, orgId: bigint, kind: bigint, metadataUri: string): Promise<bigint> {
  const bodyId = await nextId(isoCore, "nextBodyId");
  await (await isoCore.connect(admin).createBody(orgId, kind, metadataUri)).wait();
  return bodyId;
}

async function grant(isoCore: any, admin: any, orgId: bigint, bodyId: bigint, roleType: bigint, holder: string, proposalType: bigint): Promise<void> {
  const roleId = await nextId(isoCore, "nextRoleId");
  await (await isoCore.connect(admin).createRole(orgId, bodyId, roleType, `ipfs://role-${roleId}`)).wait();
  await (await isoCore.connect(admin).assignMandate(orgId, roleId, holder, 0, 0, mask(proposalType), 0)).wait();
}

async function createOrgExecutor(isoProposals: any, admin: any, orgId: bigint) {
  const orgExecutor = await ethers.deployContract("IsoOrgExecutor", [await isoProposals.getAddress(), orgId]);
  const address = await orgExecutor.getAddress();
  await (await isoProposals.connect(admin).setOrgExecutor(orgId, address)).wait();
  return { contract: orgExecutor, address };
}

function selectorFor(target: any, signature: string): string {
  return target.interface.getFunction(signature).selector;
}

async function configureTargetExecutionRules(isoProposals: any, targetContract: any, admin: any, orgId: bigint, signatures: readonly string[]) {
  const target = await targetContract.getAddress();
  await (await isoProposals.connect(admin).setExecutionTargetRule(orgId, target, true, DEMO_TARGET_MAX_VALUE)).wait();
  const selectors: Array<{ signature: string; selector: string }> = [];

  for (const signature of signatures) {
    const selector = selectorFor(targetContract, signature);
    await (await isoProposals.connect(admin).setExecutionSelectorRule(orgId, target, selector, true)).wait();
    selectors.push({ signature, selector });
  }

  return {
    address: target,
    maxValue: DEMO_TARGET_MAX_VALUE.toString(),
    selectors,
  };
}

async function configureDemoTargetExecutionRules(isoProposals: any, demoTarget: any, admin: any, orgId: bigint) {
  const target = await demoTarget.getAddress();
  await (await isoProposals.connect(admin).setExecutionTargetRule(orgId, target, true, DEMO_TARGET_MAX_VALUE)).wait();
  const selectors: Array<{ signature: string; selector: string }> = [];

  for (const signature of DEMO_TARGET_FUNCTIONS) {
    const selector = demoTarget.interface.getFunction(signature).selector;
    await (await isoProposals.connect(admin).setExecutionSelectorRule(orgId, target, selector, true)).wait();
    selectors.push({ signature, selector });
  }

  return {
    address: target,
    maxValue: DEMO_TARGET_MAX_VALUE.toString(),
    selectors,
  };
}

async function createDemoProposal(isoProposals: any, demoTarget: any, proposer: any, orgId: bigint, proposalType: bigint, number: bigint): Promise<bigint> {
  const actionData = demoTarget.interface.encodeFunctionData("setNumber", [orgId, number]);
  return createTargetProposal(isoProposals, demoTarget, proposer, orgId, proposalType, actionData);
}

async function createTargetProposal(isoProposals: any, demoTarget: any, proposer: any, orgId: bigint, proposalType: bigint, actionData: string, value = 0n): Promise<bigint> {
  const proposalId = await nextId(isoProposals, "nextProposalId");
  const actionSelector = selectorFromActionData(actionData);
  await (await isoProposals.connect(proposer).createProposal(orgId, proposalType, await demoTarget.getAddress(), value, actionSelector, ethers.keccak256(actionData), `ipfs://proposal-${proposalId}`)).wait();
  return proposalId;
}

async function createExecutedFeatureProposal(context: any) {
  const { isoProposals, demoTarget, proposer, approver, executor, orgId, approvalBodyId } = context;
  const feature = ethers.id("feature:public-governance-archive");
  const actionData = demoTarget.interface.encodeFunctionData("setFeatureEnabled", [orgId, feature, true]);
  const actionSelector = selectorFromActionData(actionData);
  const proposalId = await createTargetProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await isoProposals.connect(approver).approveProposal(orgId, proposalId, approvalBodyId)).wait();
  await (await isoProposals.connect(executor).executeProposal(orgId, proposalId, actionData)).wait();

  return {
    proposalId: proposalId.toString(),
    action: "setFeatureEnabled",
    actionSelector,
    feature,
    enabled: true,
    status: "executed",
  };
}

async function createApprovedPendingObligationProposal(context: any) {
  const { isoProposals, demoTarget, proposer, approver, orgId, approvalBodyId } = context;
  const obligationId = ethers.id("obligation:pending-demo-follow-through");
  const actionData = demoTarget.interface.encodeFunctionData("markObligationAccepted", [orgId, obligationId]);
  const actionSelector = selectorFromActionData(actionData);
  const proposalId = await createTargetProposal(isoProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await isoProposals.connect(approver).approveProposal(orgId, proposalId, approvalBodyId)).wait();

  return {
    proposalId: proposalId.toString(),
    action: "markObligationAccepted",
    actionSelector,
    obligationId,
    status: "approved_not_executed",
  };
}

async function seedDemoVotesToken(context: any) {
  const { demoVotesToken, holders } = context;
  const mintAmount = ethers.parseEther("1000");
  const mintedTo = {
    proposer: holders.proposer.address,
    approverA: holders.approverA.address,
    approverB: holders.approverB.address,
    executor: holders.executor.address,
  };

  for (const holder of Object.values(holders) as any[]) {
    await (await demoVotesToken.mint(holder.address, mintAmount)).wait();
    await (await demoVotesToken.connect(holder).delegate(holder.address)).wait();
  }

  return {
    token: await demoVotesToken.getAddress(),
    symbol: await demoVotesToken.symbol(),
    mintAmount: mintAmount.toString(),
    delegated: true,
    holders: mintedTo,
  };
}

await main();

async function resolveProtocolContracts() {
  const networkInfo = await ethers.provider.getNetwork();
  const addresses = resolveDemoLocalContractAddresses({ chainId: networkInfo.chainId });

  return {
    isoCore: await ethers.getContractAt("IsoCore", addresses.isoCore),
    isoProposals: await ethers.getContractAt("IsoProposals", addresses.isoProposals),
    demoTarget: await ethers.getContractAt(DEMO_TARGET_CONTRACT, addresses.demoTarget),
    demoVotesToken: addresses.demoVotesToken === undefined ? undefined : await ethers.getContractAt(DEMO_VOTES_TOKEN_CONTRACT, addresses.demoVotesToken),
    demoOwnableTarget: await ethers.getContractAt(DEMO_OWNABLE_TARGET_CONTRACT, addresses.demoOwnableTarget),
    demoAccessControlTarget: await ethers.getContractAt(DEMO_ACCESS_CONTROL_TARGET_CONTRACT, addresses.demoAccessControlTarget),
    demoAccessManager: await ethers.getContractAt(DEMO_ACCESS_MANAGER_CONTRACT, addresses.demoAccessManager),
    demoAccessManagedTarget: await ethers.getContractAt(DEMO_ACCESS_MANAGED_TARGET_CONTRACT, addresses.demoAccessManagedTarget),
  };
}
