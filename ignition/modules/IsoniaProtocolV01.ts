import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("IsoniaProtocolV01Module", (m) => {
  const deployer = m.getAccount(0);

  const govCore = m.contract("GovCore");
  const demoTarget = m.contract("DemoTarget", [deployer]);
  const govProposals = m.contract("GovProposals", [govCore, demoTarget]);

  m.call(demoTarget, "setGovProposals", [govProposals]);

  return { govCore, govProposals, demoTarget };
});
