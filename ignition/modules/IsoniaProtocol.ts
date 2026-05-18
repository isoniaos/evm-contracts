import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("IsoniaProtocolModule", (m) => {
  const govCore = m.contract("GovCore");
  const govProposals = m.contract("GovProposals", [govCore]);

  return { govCore, govProposals };
});
