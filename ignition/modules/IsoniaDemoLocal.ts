import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DEMO_TARGET_CONTRACT = "contracts/demo/DemoTarget.sol:DemoTarget";
const DEMO_VOTES_TOKEN_CONTRACT = "contracts/demo/IsoDemoVotesToken.sol:IsoDemoVotesToken";
const DEMO_OWNABLE_TARGET_CONTRACT = "contracts/demo/targets/IsoOwnableTarget.sol:IsoOwnableTarget";
const DEMO_ACCESS_CONTROL_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessControlTarget.sol:IsoAccessControlTarget";
const DEMO_ACCESS_MANAGER_CONTRACT = "contracts/demo/targets/IsoDemoAccessManager.sol:IsoDemoAccessManager";
const DEMO_ACCESS_MANAGED_TARGET_CONTRACT = "contracts/demo/targets/IsoAccessManagedTarget.sol:IsoAccessManagedTarget";

export default buildModule("IsoniaDemoLocalModule", (m) => {
  const deployer = m.getAccount(0);

  const isoCore = m.contract("IsoCore");
  const demoTarget = m.contract(DEMO_TARGET_CONTRACT, [deployer], { id: "DemoTarget" });
  const demoVotesToken = m.contract(DEMO_VOTES_TOKEN_CONTRACT, [deployer], { id: "IsoDemoVotesToken" });
  const demoOwnableTarget = m.contract(DEMO_OWNABLE_TARGET_CONTRACT, [deployer], { id: "IsoOwnableTarget" });
  const demoAccessControlTarget = m.contract(DEMO_ACCESS_CONTROL_TARGET_CONTRACT, [deployer], { id: "IsoAccessControlTarget" });
  const demoAccessManager = m.contract(DEMO_ACCESS_MANAGER_CONTRACT, [deployer], { id: "IsoDemoAccessManager" });
  const demoAccessManagedTarget = m.contract(DEMO_ACCESS_MANAGED_TARGET_CONTRACT, [demoAccessManager], { id: "IsoAccessManagedTarget" });
  const isoProposals = m.contract("IsoProposals", [isoCore]);

  m.call(demoTarget, "setIsoProposals", [isoProposals]);

  return {
    isoCore,
    isoProposals,
    demoTarget,
    demoVotesToken,
    demoOwnableTarget,
    demoAccessControlTarget,
    demoAccessManager,
    demoAccessManagedTarget,
  };
});
