import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DEMO_TARGET_CONTRACT = "contracts/demo/DemoTarget.sol:DemoTarget";
const DEMO_VOTES_TOKEN_CONTRACT = "contracts/demo/IsoDemoVotesToken.sol:IsoDemoVotesToken";

export default buildModule("IsoniaDemoLocalModule", (m) => {
  const deployer = m.getAccount(0);

  const govCore = m.contract("GovCore");
  const demoTarget = m.contract(DEMO_TARGET_CONTRACT, [deployer], { id: "DemoTarget" });
  const demoVotesToken = m.contract(DEMO_VOTES_TOKEN_CONTRACT, [deployer], { id: "IsoDemoVotesToken" });
  const govProposals = m.contract("GovProposals", [govCore]);

  m.call(demoTarget, "setGovProposals", [govProposals]);

  return { govCore, govProposals, demoTarget, demoVotesToken };
});
