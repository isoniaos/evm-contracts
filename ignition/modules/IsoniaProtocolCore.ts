import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("IsoniaProtocolCoreModule", (m) => {
  const govCore = m.contract("GovCore");
  const govProposals = m.contract("GovProposals", [govCore]);

  return { govCore, govProposals };
});
