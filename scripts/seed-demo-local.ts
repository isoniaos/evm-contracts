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
  const { govCore, govProposals, demoTarget, demoVotesToken } = await resolveProtocolContracts();

  const simple = await createSimpleDaoPlus({
    govCore,
    govProposals,
    demoTarget,
    admin: simpleAdmin,
    proposer,
    councilApprover: approverA,
    treasuryApprover: approverB,
    vetoer,
    executor,
  });

  const bicameral = await createBicameralPreview({
    govCore,
    govProposals,
    demoTarget,
    admin: bicameralAdmin,
    proposer,
    capitalApprover: approverA,
    meritApprover: approverB,
    vetoer,
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
      govCore: await govCore.getAddress(),
      govProposals: await govProposals.getAddress(),
      demoTarget: await demoTarget.getAddress(),
      ...(demoVotesToken === undefined ? {} : { demoVotesToken: await demoVotesToken.getAddress() }),
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
    organizations: { simple, bicameral },
    ...(demoVotes === undefined ? {} : { demoVotes }),
  }, null, 2));
}

async function createSimpleDaoPlus(context: any) {
  const { govCore, govProposals, demoTarget, admin, proposer, councilApprover, treasuryApprover, vetoer, executor } = context;
  const orgId = await nextId(govCore, "nextOrgId");
  await (await govCore.createOrganization("simple-dao-plus", "ipfs://simple-dao-plus", admin.address)).wait();
  const council = await createBody(govCore, admin, orgId, BODY_KIND.generalCouncil, "ipfs://simple-general-council");
  const treasury = await createBody(govCore, admin, orgId, BODY_KIND.treasuryCommittee, "ipfs://simple-treasury-committee");
  const security = await createBody(govCore, admin, orgId, BODY_KIND.securityCouncil, "ipfs://simple-security-council");

  await grant(govCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.standard);
  await grant(govCore, admin, orgId, council, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, council, ROLE_TYPE.approver, councilApprover.address, PROPOSAL_TYPE.standard);
  await grant(govCore, admin, orgId, council, ROLE_TYPE.approver, councilApprover.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, treasury, ROLE_TYPE.approver, treasuryApprover.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, security, ROLE_TYPE.vetoer, vetoer.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.standard);
  await grant(govCore, admin, orgId, council, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.treasury);

  await (await govCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.standard, [council], [], council, 0, true)).wait();
  await (await govCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.treasury, [council, treasury], [security], council, 3600, true)).wait();
  const demoExecutionTarget = await configureDemoTargetExecutionRules(govProposals, demoTarget, admin, orgId);

  const standardProposalId = await createDemoProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, 101n);
  const treasuryProposalId = await createDemoProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.treasury, 202n);
  const executedFeatureProposal = await createExecutedFeatureProposal({
    govProposals,
    demoTarget,
    proposer,
    approver: councilApprover,
    executor,
    orgId,
    approvalBodyId: council,
  });
  const pendingObligationProposal = await createApprovedPendingObligationProposal({
    govProposals,
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
  const { govCore, govProposals, demoTarget, admin, proposer, capitalApprover, meritApprover, vetoer, executor } = context;
  const orgId = await nextId(govCore, "nextOrgId");
  await (await govCore.createOrganization("bicameral-preview", "ipfs://bicameral-preview", admin.address)).wait();
  const capital = await createBody(govCore, admin, orgId, BODY_KIND.capitalHouse, "ipfs://capital-house");
  const merit = await createBody(govCore, admin, orgId, BODY_KIND.meritHouse, "ipfs://merit-house");
  const emergency = await createBody(govCore, admin, orgId, BODY_KIND.emergencyCouncil, "ipfs://emergency-council");

  await grant(govCore, admin, orgId, capital, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, merit, ROLE_TYPE.proposer, proposer.address, PROPOSAL_TYPE.upgrade);
  await grant(govCore, admin, orgId, capital, ROLE_TYPE.approver, capitalApprover.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, merit, ROLE_TYPE.approver, meritApprover.address, PROPOSAL_TYPE.upgrade);
  await grant(govCore, admin, orgId, emergency, ROLE_TYPE.vetoer, vetoer.address, PROPOSAL_TYPE.upgrade);
  await grant(govCore, admin, orgId, emergency, ROLE_TYPE.approver, meritApprover.address, PROPOSAL_TYPE.emergency);
  await grant(govCore, admin, orgId, capital, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.treasury);
  await grant(govCore, admin, orgId, merit, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.upgrade);
  await grant(govCore, admin, orgId, emergency, ROLE_TYPE.executor, executor.address, PROPOSAL_TYPE.emergency);

  await (await govCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.treasury, [capital], [], capital, 0, true)).wait();
  await (await govCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.upgrade, [merit], [emergency], merit, 7200, true)).wait();
  await (await govCore.connect(admin).setPolicyRule(orgId, PROPOSAL_TYPE.emergency, [emergency], [], emergency, 0, true)).wait();
  const demoExecutionTarget = await configureDemoTargetExecutionRules(govProposals, demoTarget, admin, orgId);

  const treasuryProposalId = await createDemoProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.treasury, 303n);
  const upgradeProposalId = await createDemoProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.upgrade, 404n);

  return {
    orgId: orgId.toString(),
    bodies: { capital: capital.toString(), merit: merit.toString(), emergency: emergency.toString() },
    proposals: { treasuryProposalId: treasuryProposalId.toString(), upgradeProposalId: upgradeProposalId.toString() },
    executionTargets: { demoTarget: demoExecutionTarget },
  };
}

async function nextId(contract: any, methodName: string): Promise<bigint> {
  return await contract.getFunction(methodName)();
}

async function createBody(govCore: any, admin: any, orgId: bigint, kind: bigint, metadataUri: string): Promise<bigint> {
  const bodyId = await nextId(govCore, "nextBodyId");
  await (await govCore.connect(admin).createBody(orgId, kind, metadataUri)).wait();
  return bodyId;
}

async function grant(govCore: any, admin: any, orgId: bigint, bodyId: bigint, roleType: bigint, holder: string, proposalType: bigint): Promise<void> {
  const roleId = await nextId(govCore, "nextRoleId");
  await (await govCore.connect(admin).createRole(orgId, bodyId, roleType, `ipfs://role-${roleId}`)).wait();
  await (await govCore.connect(admin).assignMandate(orgId, roleId, holder, 0, 0, mask(proposalType), 0)).wait();
}

async function configureDemoTargetExecutionRules(govProposals: any, demoTarget: any, admin: any, orgId: bigint) {
  const target = await demoTarget.getAddress();
  await (await govProposals.connect(admin).setExecutionTargetRule(orgId, target, true, DEMO_TARGET_MAX_VALUE)).wait();
  const selectors: Array<{ signature: string; selector: string }> = [];

  for (const signature of DEMO_TARGET_FUNCTIONS) {
    const selector = demoTarget.interface.getFunction(signature).selector;
    await (await govProposals.connect(admin).setExecutionSelectorRule(orgId, target, selector, true)).wait();
    selectors.push({ signature, selector });
  }

  return {
    address: target,
    maxValue: DEMO_TARGET_MAX_VALUE.toString(),
    selectors,
  };
}

async function createDemoProposal(govProposals: any, demoTarget: any, proposer: any, orgId: bigint, proposalType: bigint, number: bigint): Promise<bigint> {
  const actionData = demoTarget.interface.encodeFunctionData("setNumber", [orgId, number]);
  return createTargetProposal(govProposals, demoTarget, proposer, orgId, proposalType, actionData);
}

async function createTargetProposal(govProposals: any, demoTarget: any, proposer: any, orgId: bigint, proposalType: bigint, actionData: string, value = 0n): Promise<bigint> {
  const proposalId = await nextId(govProposals, "nextProposalId");
  const actionSelector = selectorFromActionData(actionData);
  await (await govProposals.connect(proposer).createProposal(orgId, proposalType, await demoTarget.getAddress(), value, actionSelector, ethers.keccak256(actionData), `ipfs://proposal-${proposalId}`)).wait();
  return proposalId;
}

async function createExecutedFeatureProposal(context: any) {
  const { govProposals, demoTarget, proposer, approver, executor, orgId, approvalBodyId } = context;
  const feature = ethers.id("feature:public-governance-archive");
  const actionData = demoTarget.interface.encodeFunctionData("setFeatureEnabled", [orgId, feature, true]);
  const actionSelector = selectorFromActionData(actionData);
  const proposalId = await createTargetProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await govProposals.connect(approver).approveProposal(orgId, proposalId, approvalBodyId)).wait();
  await (await govProposals.connect(executor).executeProposal(orgId, proposalId, actionData)).wait();

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
  const { govProposals, demoTarget, proposer, approver, orgId, approvalBodyId } = context;
  const obligationId = ethers.id("obligation:pending-demo-follow-through");
  const actionData = demoTarget.interface.encodeFunctionData("markObligationAccepted", [orgId, obligationId]);
  const actionSelector = selectorFromActionData(actionData);
  const proposalId = await createTargetProposal(govProposals, demoTarget, proposer, orgId, PROPOSAL_TYPE.standard, actionData);
  await (await govProposals.connect(approver).approveProposal(orgId, proposalId, approvalBodyId)).wait();

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
    govCore: await ethers.getContractAt("GovCore", addresses.govCore),
    govProposals: await ethers.getContractAt("GovProposals", addresses.govProposals),
    demoTarget: await ethers.getContractAt(DEMO_TARGET_CONTRACT, addresses.demoTarget),
    demoVotesToken: addresses.demoVotesToken === undefined ? undefined : await ethers.getContractAt(DEMO_VOTES_TOKEN_CONTRACT, addresses.demoVotesToken),
  };
}
